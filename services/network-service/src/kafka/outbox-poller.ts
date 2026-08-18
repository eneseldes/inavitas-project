import type { Logger } from '@inavitas/shared';

export interface OutboxPollerHandle {
  stop(): void;
}

/**
 * Transactional outbox poller döngüsü.
 */
export function startOutboxPoller(log: Logger): OutboxPollerHandle {
  log.info('Outbox poller başlatıldı');
  return { stop: () => log.info('Outbox poller durduruldu') };
}
