import {
  createKafkaClient,
  createProducer,
  startConsumer,
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

export async function connectKafka(): Promise<void> {
  producer = await createProducer(kafka);
}

export function getProducer(): EventPublisher {
  if (!producer) throw new Error('Kafka producer henüz bağlanmadı — connectKafka() çağrılmadı');
  return producer;
}

/** Kafka tüketicisini (work-order topic'leri için) başlatır. */
export async function startOutageConsumer(handler: EventHandler, logger: Logger): Promise<void> {
  consumerHandle = await startConsumer(
    kafka,
    CONSUMER_GROUPS.OUTAGE_SERVICE,
    [TOPICS.WORK_ORDER_CREATED, TOPICS.WORK_ORDER_LINKED, TOPICS.WORK_ORDER_DONE],
    handler,
    getProducer(),
    logger,
  );
}

export async function disconnectKafka(): Promise<void> {
  await consumerHandle?.stop();
  await producer?.disconnect();
}
