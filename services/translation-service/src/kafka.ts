import {
  createKafkaClient,
  createProducer,
  type Admin,
  type EventPublisher,
  type Logger,
} from '@inavitas/shared';
import { config } from './config.ts';

const kafka = createKafkaClient({
  clientId: `${config.KAFKA_CLIENT_ID}-translation-service`,
  brokers: config.KAFKA_BROKERS,
});

let producer: EventPublisher | undefined;
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

export function getAdmin(): Admin {
  if (!admin) throw new Error('Kafka admin henüz bağlanmadı — connectKafka() çağrılmadı');
  return admin;
}

export async function disconnectKafka(): Promise<void> {
  await producer?.disconnect();
  await admin?.disconnect();
}
