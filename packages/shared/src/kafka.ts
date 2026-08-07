import { Kafka, logLevel, type EachMessagePayload } from 'kafkajs';
import { isRetryable } from './errors.ts';
import type { Logger } from './logger.ts';

export type { Kafka } from 'kafkajs';

export interface KafkaConnectionOptions {
  clientId: string;
  brokers: string[];
}

/** Kafka istemcisi (client) örneği oluşturur. */
export function createKafkaClient(opts: KafkaConnectionOptions): Kafka {
  return new Kafka({
    clientId: opts.clientId,
    brokers: opts.brokers,
    retry: { initialRetryTime: 300, retries: 10 },
    logLevel: logLevel.ERROR,
  });
}

export interface EventPublisher {
  /** Event zarfını JSON formatında belirtilen topic'e yayınlar. */
  publish(topic: string, key: string, envelope: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

/** Kafka event üreticisi (producer) oluşturur. */
export async function createProducer(kafka: Kafka): Promise<EventPublisher> {
  const producer = kafka.producer({ allowAutoTopicCreation: false });
  await producer.connect();

  return {
    async publish(topic, key, envelope) {
      await producer.send({
        topic,
        messages: [{ key, value: JSON.stringify(envelope) }],
      });
    },
    async disconnect() {
      await producer.disconnect();
    },
  };
}

/** İşleme hatalarında kademeli bekleme (backoff) süreleri (milisaniye). */
const RETRY_DELAYS_MS = [1_000, 5_000, 25_000];

export type EventHandler = (topic: string, message: unknown) => Promise<void>;

export interface ConsumerHandle {
  stop(): Promise<void>;
}

/**
 * Kafka tüketici (consumer) dinleyicisini başlatır.
 * Geçici hatalarda kademeli yeniden deneme yapar; kalıcı veya sınırı aşan hatalarda mesajı DLQ topic'ine aktarır.
 */
export async function startConsumer(
  kafka: Kafka,
  groupId: string,
  topics: string[],
  handler: EventHandler,
  dlq: EventPublisher,
  logger: Logger,
): Promise<ConsumerHandle> {
  const consumer = kafka.consumer({ groupId, sessionTimeout: 30_000, heartbeatInterval: 3_000 });
  await consumer.connect();
  await consumer.subscribe({ topics, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message, heartbeat }: EachMessagePayload) => {
      const key = message.key?.toString('utf8') ?? null;
      const raw = message.value?.toString('utf8') ?? '';

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        logger.error({ topic, partition, err }, 'Bozuk JSON formatı, mesaj DLQ kuyruğuna aktarılıyor');
        await dlq.publish(`${topic}.DLQ`, key ?? '', { raw, reason: 'invalid_json' });
        return;
      }

      for (let attempt = 0; ; attempt++) {
        try {
          await handler(topic, parsed);
          return;
        } catch (err) {
          const canRetry = isRetryable(err) && attempt < RETRY_DELAYS_MS.length;
          if (!canRetry) {
            logger.error(
              { topic, partition, err, attempt },
              'Event işlenemedi, maksimum deneme sınırına ulaşıldı veya kalıcı hata: DLQ\'ya aktarılıyor',
            );
            await dlq.publish(`${topic}.DLQ`, key ?? '', {
              original: parsed,
              reason: err instanceof Error ? err.message : String(err),
            });
            return;
          }

          logger.warn({ topic, partition, err, attempt }, 'Geçici işleme hatası, tekrar denenecek');
          await heartbeat();
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          await heartbeat();
        }
      }
    },
  });

  return {
    async stop() {
      await consumer.disconnect();
    },
  };
}
