import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from './config.ts';
import * as schema from './db/schema.ts';

/**
 * Bağlantı havuzu ve Drizzle örneği — süreç başına TEK sefer (bkz.
 * outage-service/src/db.ts için aynı gerekçe).
 */
const pool = new Pool({ connectionString: config.WORK_ORDER_APP_DATABASE_URL });

export const db = drizzle(pool, { schema });

export async function disconnectDb(): Promise<void> {
  await pool.end();
}
