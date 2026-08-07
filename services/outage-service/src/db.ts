import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from './config.ts';
import * as schema from './db/schema.ts';

/** PostgreSQL bağlantı havuzu. */
const pool = new Pool({ connectionString: config.OUTAGE_APP_DATABASE_URL });

// Boşta bekleyen bağlantı kesilmelerinde uygulamanın durmasını engellemek için havuz hata dinleyicisi.
pool.on('error', (err) => {
  console.error('[outage-service] Postgres pool hatası (boşta bağlantı kesildi, devam ediliyor):', err.message);
});

/** Drizzle ORM veritabanı istemcisi. */
export const db = drizzle(pool, { schema });

/** Veritabanı transaction veri tipi. */
export type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** Veritabanı bağlantı havuzunu kapatır. */
export async function disconnectDb(): Promise<void> {
  await pool.end();
}
