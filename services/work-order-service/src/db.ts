import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from './config.ts';
import * as schema from './db/schema.ts';

/**
 * Bağlantı havuzu ve Drizzle örneği — süreç başına TEK sefer (bkz.
 * outage-service/src/db.ts için aynı gerekçe).
 */
const pool = new Pool({ connectionString: config.WORK_ORDER_APP_DATABASE_URL });

export const db = drizzle(pool, { schema });

/** `db.transaction()`daki `tx`in tipi — bkz. outage-service/src/db.ts için aynı gerekçe. */
export type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export async function disconnectDb(): Promise<void> {
  await pool.end();
}
