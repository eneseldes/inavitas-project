import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.ts';
import { networkComponentsRo } from '../db/schema.ts';

export type NetworkComponentRoRow = typeof networkComponentsRo.$inferSelect;

/**
 * CBS ID'nin karşılığını read-model'den okur.
 *
 * ⚠️ `network-service`'e senkron HTTP çağrısı **yoktur** — servisler arası iletişim Kafka'dır;
 * doğrulama ve konum bilgisi bu yerel read-model'den gelir. Tablo `db:seed` ile tek
 * seferlik doldurulur; şebeke modeli değişmediği için olayla güncellenmez.
 */
export async function findById(cbsId: string): Promise<NetworkComponentRoRow | null> {
  const [row] = await db.select().from(networkComponentsRo).where(eq(networkComponentsRo.id, cbsId));
  return row ?? null;
}

/** Birden çok CBS ID'yi tek sorguda getirir. */
export async function findByIds(ids: string[]): Promise<NetworkComponentRoRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(networkComponentsRo).where(inArray(networkComponentsRo.id, ids));
}
