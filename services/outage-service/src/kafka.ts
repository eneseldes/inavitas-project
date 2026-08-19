import {
  createKafkaClient,
  createProducer,
  startConsumer,
  type Admin,
  type ConsumerHandle,
  type EventHandler,
  type EventPublisher,
  type Logger,
} from '@inavitas/shared';
import { CONSUMER_GROUPS, TOPICS } from '@inavitas/contracts';
import { config } from './config.ts';

const kafka = createKafkaClient({
  clientId: `${config.KAFKA_CLIENT_ID}-outage-service`,
  brokers: config.KAFKA_BROKERS,
});

let producer: EventPublisher | undefined;
let consumerHandle: ConsumerHandle | undefined;
let admin: Admin | undefined;

export async function connectKafka(): Promise<void> {
  producer = await createProducer(kafka);
  admin = kafka.admin();
  await admin.connect();
}

export function getProducer(): EventPublisher {
  if (!producer) throw new Error('Kafka producer henüz bağlanmadı — connectKafka() çağrılmadı');
  return producer;
}

/** `/ready` uç noktasının Kafka broker'ına gerçekten ulaşılabildiğini doğrulamak için kullandığı istemci. */
export function getAdmin(): Admin {
  if (!admin) throw new Error('Kafka admin henüz bağlanmadı — connectKafka() çağrılmadı');
  return admin;
}

/**
 * Kafka tüketicisini başlatır.
 *
 * `outage.energized` ve `outage.impact.calculated` bu servisin **kendi** yayınladığı
 * olaylardır: etkinin geri yazılması ve kapsanan kesintilerin otomatik çözülmesi HTTP
 * isteğinin içinde değil, olay akışında yürür — böylece kesinti açan istek etki hesabını
 * beklemez.
 */
export async function startOutageConsumer(handler: EventHandler, logger: Logger): Promise<void> {
  consumerHandle = await startConsumer(
    kafka,
    CONSUMER_GROUPS.OUTAGE_SERVICE,
    [
      TOPICS.WORK_ORDER_CREATED,
      TOPICS.WORK_ORDER_LINKED,
      TOPICS.WORK_ORDER_DONE,
      TOPICS.OUTAGE_IMPACT_CALCULATED,
      TOPICS.OUTAGE_ENERGIZED,
    ],
    handler,
    getProducer(),
    logger,
  );
}

export async function disconnectKafka(): Promise<void> {
  await consumerHandle?.stop();
  await producer?.disconnect();
  await admin?.disconnect();
}
