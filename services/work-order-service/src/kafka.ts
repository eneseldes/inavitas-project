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

/** bkz. outage-service/src/kafka.ts için aynı gerekçe. */
const kafka = createKafkaClient({
  clientId: `${config.KAFKA_CLIENT_ID}-work-order-service`,
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

/** `outage.created` ve `outage.linked` ve `outage.energized` — bkz. kafka/consumers.ts. */
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
}
