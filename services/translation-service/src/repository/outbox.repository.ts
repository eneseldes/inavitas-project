import { asc, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../db.ts';
import { outbox } from '../db/schema.ts';

export type OutboxRow = typeof outbox.$inferSelect;

/** Yayınlanacak event'i, iş yazımıyla AYNI transaction'da outbox'a yazar. */
export async function enqueueTx(tx: Tx, topic: string, partitionKey: string, payload: unknown): Promise<void> {
  await tx.insert(outbox).values({ topic, partitionKey, payload });
}

/**
 * Henüz yayınlanmamış bir grup kaydı kilitler (`FOR UPDATE SKIP LOCKED`).
 * Kilitleme, poller'ın her tetiklenişinde aynı satırları tekrar almasını önler.
 */
export async function claimBatchTx(tx: Tx, limit: number): Promise<OutboxRow[]> {
  return tx
    .select()
    .from(outbox)
    .where(isNull(outbox.publishedAt))
    .orderBy(asc(outbox.createdAt))
    .limit(limit)
    .for('update', { skipLocked: true });
}

export async function markPublishedTx(tx: Tx, id: string): Promise<void> {
  await tx.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, id));
}

/** Denemeyi bir artırır ve yeni deneme sayısını döner (alarm eşiği kontrolü için). */
export async function markFailedTx(tx: Tx, id: string): Promise<number> {
  const [row] = await tx
    .update(outbox)
    .set({ attempts: sql`${outbox.attempts} + 1` })
    .where(eq(outbox.id, id))
    .returning({ attempts: outbox.attempts });

  return row?.attempts ?? 0;
}
