/**
 * `network.outage_states_ro` — aktif kesinti read-model'i.
 *
 * Yazımı her zaman olay tüketimiyle **aynı transaction**'da yapılır (bkz. `markProcessed`
 * deseni); okuması boot'ta ve `/ready` kontrolünde kullanılır.
 */

import { eq, sql } from 'drizzle-orm';
import { db, type Tx } from '../db.ts';
import { outageStatesRo } from '../db/schema.ts';

export type OutageStateRow = typeof outageStatesRo.$inferSelect;

/** Kesintiyi enerjisizlik yaratan (aktif) sayan tek durum. */
export const ACTIVE_OUTAGE_STATUS = 'STARTED';

export interface OutageStateInput {
  outageId: string;
  cbsId: string;
  status: string;
  startedAt: Date;
}

/**
 * Read-model satırını yazar/günceller. Aynı kesinti için gelen daha yeni bir durum satırı
 * ezer — olaylar sırasız gelebilir, son yazan kazanır.
 */
export async function upsertTx(tx: Tx, input: OutageStateInput): Promise<void> {
  await tx
    .insert(outageStatesRo)
    .values({
      outageId: input.outageId,
      cbsId: input.cbsId,
      status: input.status,
      startedAt: input.startedAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: outageStatesRo.outageId,
      set: { status: input.status, cbsId: input.cbsId, updatedAt: new Date() },
    });
}

/** Kesintinin durumunu günceller; kayıt yoksa hiçbir şey yapmaz (olay sırası bozuksa sessiz kalır). */
export async function updateStatusTx(tx: Tx, outageId: string, status: string): Promise<void> {
  await tx
    .update(outageStatesRo)
    .set({ status, updatedAt: new Date() })
    .where(eq(outageStatesRo.outageId, outageId));
}

/** Enerjisizlik yaratan tüm kesintileri döner — boot'ta ve her yeniden hesapta okunur. */
export async function findActive(): Promise<OutageStateRow[]> {
  return db
    .select()
    .from(outageStatesRo)
    .where(eq(outageStatesRo.status, ACTIVE_OUTAGE_STATUS))
    .orderBy(sql`${outageStatesRo.startedAt} ASC`);
}
