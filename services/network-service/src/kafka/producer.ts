import type { RawEventEnvelope } from '@inavitas/contracts';

export interface PublishOptions {
  origin: 'USER' | 'SYSTEM';
  actor: string;
  correlationId: string;
  causedBy?: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

/**
 * network-service Kafka outbox/producer altyapısı.
 */
