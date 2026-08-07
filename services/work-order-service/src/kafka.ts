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
  clientId: `${config.KAFKA_CLIENT_ID}-work-order-service`,
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

/** Kafka tüketicisini (outage topic'leri için) başlatır. */
export async function startWorkOrderConsumer(handler: EventHandler, logger: Logger): Promise<void> {
  consumerHandle = await startConsumer(
    kafka,
    CONSUMER_GROUPS.WORK_ORDER_SERVICE,
    [TOPICS.OUTAGE_CREATED, TOPICS.OUTAGE_LINKED, TOPICS.OUTAGE_ENERGIZED],
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
