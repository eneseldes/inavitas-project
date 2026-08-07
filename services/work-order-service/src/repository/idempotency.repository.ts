import type { Tx } from '../db.ts';
import { processedEvents } from '../db/schema.ts';

/**
 * Gelen event'i işlendi olarak kaydeder. Event önceden işlenmişse `false` döner.
 */
export async function markProcessed(tx: Tx, eventId: string, topic: string): Promise<boolean> {
  const rows = await tx
    .insert(processedEvents)
    .values({ eventId, topic })
    .onConflictDoNothing()
    .returning({ eventId: processedEvents.eventId });

  return rows.length > 0;
}
