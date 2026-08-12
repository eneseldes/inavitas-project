import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from './config.ts';
import * as schema from './db/schema.ts';

/** PostgreSQL bağlantı havuzu. */
const pool = new Pool({ connectionString: config.ACCESS_APP_DATABASE_URL });

// Boşta bekleyen bağlantı kesilmelerinde uygulamanın durmasını engellemek için havuz hata dinleyicisi.
pool.on('error', (err: Error) => {
  console.error('[access-service] Postgres pool hatası (boşta bağlantı kesildi, devam ediliyor):', err.message);
});

/** Drizzle ORM veritabanı istemcisi. */
export const db = drizzle(pool, { schema });

/** Veritabanı bağlantı havuzunu kapatır. */
export async function disconnectDb(): Promise<void> {
  await pool.end();
}
