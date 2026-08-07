import { Kafka, logLevel, type EachMessagePayload } from 'kafkajs';
import { isRetryable } from './errors.ts';
import type { Logger } from './logger.ts';

export type { Kafka } from 'kafkajs';

export interface KafkaConnectionOptions {
  clientId: string;
  brokers: string[];
}

/**
 * Tek bir Kafka istemcisi — hem producer hem consumer(lar) bunun üzerinden
 * kurulur. `retry.retries: 10` şart: Kafka container'ı ~15-30 sn'de hazır
 * olur, servis onu beklemeden ayağa kalkarsa ilk bağlantı denemesi başarısız
 * olur (roadmap Faz 0/4 tuzağı).
 */
export function createKafkaClient(opts: KafkaConnectionOptions): Kafka {
  return new Kafka({
    clientId: opts.clientId,
    brokers: opts.brokers,
    retry: { initialRetryTime: 300, retries: 10 },
    // kafkajs'in kendi log çıktısı formatı bizimkinden farklı ve gürültülü;
    // uygulama tarafındaki hataları biz zaten pino ile logluyoruz.
    logLevel: logLevel.ERROR,
  });
}

export interface EventPublisher {
  /** Zarfı JSON'a çevirip verilen topic'e, verilen partition anahtarıyla yazar. */
  publish(topic: string, key: string, envelope: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Üretici sarmalayıcı. `AUTO_CREATE_TOPICS_ENABLE=false` olduğu için
 * `allowAutoTopicCreation: false` — yazım hatası yaptığında sessizce yeni
 * bir topic açmak yerine `UNKNOWN_TOPIC_OR_PARTITION` almak istiyoruz.
 */
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

/** Kalıcı hata / 3 denemeden sonra tükenen mesajlar için bekleme süreleri (02-MIMARI 2.6). */
const RETRY_DELAYS_MS = [1_000, 5_000, 25_000];

export type EventHandler = (topic: string, message: unknown) => Promise<void>;

export interface ConsumerHandle {
  stop(): Promise<void>;
}

/**
 * Bir consumer'ı ayağa kaldırır ve mesajları `handler`a verir.
 *
 * Zehirli mesaj koruması burada yaşar: `handler` kalıcı bir hatayla
 * (`isRetryable(err) === false`, örn. ValidationError) veya 3 denemeden
 * sonra hâlâ hata veriyorsa, mesaj `{topic}.DLQ`'ya yazılır ve offset
 * normal şekilde ilerler — bir bozuk mesaj partition'ı sonsuza kadar
 * bloklamaz (roadmap Faz 4 tuzak tablosu, FR-4.6).
 *
 * Yeniden deneme aralarında `heartbeat()` çağrılır: en kötü senaryoda
 * (1s + 5s + 25s ≈ 31s) `sessionTimeout: 30_000`i aşabilir ve consumer
 * group'tan atılabilirdi; heartbeat bunu önler.
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
  // fromBeginning: true — bu group ilk kez bağlandığında (henüz commit edilmiş
  // offset yokken) topic'in başından okusun. AS-6 (servis kapalıyken biriken
  // event'lerin geri gelince işlenmesi) bunu gerektirir. Daha önce commit
  // edilmiş bir offset varsa bu bayrağın etkisi yok, kaldığı yerden devam eder.
  await consumer.subscribe({ topics, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message, heartbeat }: EachMessagePayload) => {
      const key = message.key?.toString('utf8') ?? null;
      const raw = message.value?.toString('utf8') ?? '';

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        logger.error({ topic, partition, err }, 'bozuk JSON, DLQ\'ya atılıyor');
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
              'event işlenemedi, DLQ\'ya atılıyor',
            );
            await dlq.publish(`${topic}.DLQ`, key ?? '', {
              original: parsed,
              reason: err instanceof Error ? err.message : String(err),
            });
            return;
          }

          logger.warn({ topic, partition, err, attempt }, 'geçici hata, tekrar denenecek');
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
