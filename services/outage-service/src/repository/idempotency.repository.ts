import type { Tx } from '../db.ts';
import { processedEvents } from '../db/schema.ts';

/**
 * Bir event'i "işlendi" olarak işaretlemeyi dener.
 *
 * `onConflictDoNothing()` sayesinde aynı `eventId` ikinci kez gelirse INSERT
 * sessizce hiçbir şey yapmaz — `false` döner, çağıran taraf iş mantığını
 * ATLAR. Bunu her zaman iş mantığıyla aynı transaction'da (`tx`) çağır;
 * ayrı bir transaction'da yaparsan ikisi arasında çökme penceresi kalır
 * (AS-5 idempotency senaryosu bu yüzden başarısız olur).
 */
export async function markProcessed(tx: Tx, eventId: string, topic: string): Promise<boolean> {
  const rows = await tx
    .insert(processedEvents)
    .values({ eventId, topic })
    .onConflictDoNothing()
    .returning({ eventId: processedEvents.eventId });

  return rows.length > 0;
}
