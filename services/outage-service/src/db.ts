import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from './config.ts';
import * as schema from './db/schema.ts';

/**
 * Bağlantı havuzu ve Drizzle örneği — süreç başına TEK sefer.
 *
 * Her istekte yeni havuz açmak bağlantıları kısa sürede tüketir (yol
 * haritası Faz 2 tuzakları). Modül seviyesinde tanımlayarak ESM'in modül
 * önbelleği sayesinde singleton'ı bedavaya alıyoruz.
 */
const pool = new Pool({ connectionString: config.OUTAGE_APP_DATABASE_URL });

export const db = drizzle(pool, { schema });

/**
 * `db.transaction(async (tx) => ...)` içindeki `tx`in tipi.
 *
 * Kafka consumer'ları idempotency INSERT'ini iş mantığıyla AYNI
 * transaction'da yapmak zorunda (bkz. db/schema.ts processedEvents), bu
 * yüzden repository fonksiyonlarının bir kısmı `db` yerine dışarıdan
 * verilen bu `tx` tipini kabul eden `*Tx` sürümlerine ayrıştırıldı.
 */
export type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export async function disconnectDb(): Promise<void> {
  await pool.end();
}
