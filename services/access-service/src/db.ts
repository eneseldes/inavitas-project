import { drizzle } from 'drizzle-orm/node-postgres';
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
const pool = new Pool({ connectionString: config.ACCESS_APP_DATABASE_URL });

export const db = drizzle(pool, { schema });

export async function disconnectDb(): Promise<void> {
  await pool.end();
}
