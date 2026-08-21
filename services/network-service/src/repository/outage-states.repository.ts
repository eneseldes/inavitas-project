/**
 * `network.outage_states_ro` — aktif kesinti read-model'i.
 *
 * Yazımı her zaman olay tüketimiyle **aynı transaction**'da yapılır (bkz. `markProcessed`
 * deseni); okuması boot'ta ve `/ready` kontrolünde kullanılır.
 */

import { and, eq, gt, lte, sql } from 'drizzle-orm';
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

/**
 * Enerjisizlik yaratan tüm kesintileri döner — boot'ta ve her yeniden hesapta okunur.
 *
 * ⚠️ **`started_at <= now()` süzmesi burada, tek yerde durur.** Gelecek tarihli (planlı) bir
 * kesinti `STARTED` doğar ama başlangıcı gelene kadar şebekeyi karartmamalıdır; süzme
 * çağıranlara bırakılsaydı bir çağıran unutur ve harita saatler öncesinden kararırdı.
 * Zaman kaynağı **veritabanıdır** (`now()`), sürecin saati değil: enerjilenme hesabı ile
 * read-model aynı saati okumak zorunda.
 */
export async function findActive(): Promise<OutageStateRow[]> {
  return db
    .select()
    .from(outageStatesRo)
    .where(and(eq(outageStatesRo.status, ACTIVE_OUTAGE_STATUS), lte(outageStatesRo.startedAt, sql`now()`)))
    .orderBy(sql`${outageStatesRo.startedAt} ASC`);
}

/** Başlangıcı henüz gelmemiş planlı kesintilerin özeti. */
export interface PendingStarts {
  /** Sıradaki başlangıç anı; bekleyen kesinti yoksa `null`. */
  nextStartAt: Date | null;
  /** Bekleyen planlı kesinti sayısı — zamanlayıcı ölürse bu sayı düşmeyi bırakır. */
  count: number;
}

/**
 * Gelecekte başlayacak (`started_at > now()`) kesintilerin sayısını ve en yakın başlangıç
 * anını döner. Zamanlayıcı uyanma vaktini buradan öğrenir.
 */
export async function findPendingStarts(): Promise<PendingStarts> {
  const [row] = await db
    .select({
      nextStartAt: sql<string | null>`MIN(${outageStatesRo.startedAt})`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(outageStatesRo)
    .where(and(eq(outageStatesRo.status, ACTIVE_OUTAGE_STATUS), gt(outageStatesRo.startedAt, sql`now()`)));

  return {
    nextStartAt: row?.nextStartAt ? new Date(row.nextStartAt) : null,
    count: row?.count ?? 0,
  };
}
