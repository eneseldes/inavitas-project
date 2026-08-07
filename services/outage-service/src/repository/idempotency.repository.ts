import type { Tx } from '../db.ts';
import { processedEvents } from '../db/schema.ts';

/**
 * Gelen event'i işlendi olarak veritabanına kaydeder.
 * Event daha önce işlendiyse `false` döndürerek mükerrer işlemeyi engeller.
 */
export async function markProcessed(tx: Tx, eventId: string, topic: string): Promise<boolean> {
  const rows = await tx
    .insert(processedEvents)
    .values({ eventId, topic })
    .onConflictDoNothing()
    .returning({ eventId: processedEvents.eventId });

  return rows.length > 0;
}
