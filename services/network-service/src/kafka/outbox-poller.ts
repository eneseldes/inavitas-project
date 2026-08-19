import type { Logger } from '@inavitas/shared';
import { db } from '../db.ts';
import { claimBatchTx, markFailedTx, markPublishedTx } from '../repository/outbox.repository.ts';
import { getProducer } from '../kafka.ts';

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 100;
/** Bu kadar başarısız denemeden sonra alarm seviyesinde logla (manuel inceleme sinyali). */
const ALARM_THRESHOLD = 5;

async function pollOnce(log: Logger): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await claimBatchTx(tx, BATCH_SIZE);

    for (const row of rows) {
      try {
        await getProducer().publish(row.topic, row.partitionKey, row.payload);
        await markPublishedTx(tx, row.id);
      } catch (err) {
        const attempts = await markFailedTx(tx, row.id);

        if (attempts >= ALARM_THRESHOLD) {
          log.error({ outboxId: row.id, topic: row.topic, attempts, err }, 'outbox kaydı tekrar yayınlanamıyor, manuel inceleme gerekebilir');
        } else {
          log.warn({ outboxId: row.id, topic: row.topic, attempts, err }, 'outbox yayını başarısız, tekrar denenecek');
        }
      }
    }
  });
}

export interface OutboxPollerHandle {
  stop(): void;
}

/**
 * Outbox tablosundaki yayınlanmamış olayları periyodik olarak Kafka'ya iletir.
 * `FOR UPDATE SKIP LOCKED` mekanizması ile eşzamanlı örneklerin aynı satırı işlemesi engellenir.
 */
export function startOutboxPoller(log: Logger): OutboxPollerHandle {
  const timer = setInterval(() => {
    pollOnce(log).catch((err) => log.error({ err }, 'outbox poller döngüsü başarısız'));
  }, POLL_INTERVAL_MS);

  return { stop: () => clearInterval(timer) };
}
