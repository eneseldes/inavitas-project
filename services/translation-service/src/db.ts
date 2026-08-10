import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from './config.ts';
import * as schema from './db/schema.ts';

const pool = new Pool({ connectionString: config.TRANSLATION_APP_DATABASE_URL });

pool.on('error', (err) => {
  console.error('[translation-service] Postgres pool hatası (boşta bağlantı kesildi, devam ediliyor):', err.message);
});

export const db = drizzle(pool, { schema });

export type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export async function disconnectDb(): Promise<void> {
  await pool.end();
}
