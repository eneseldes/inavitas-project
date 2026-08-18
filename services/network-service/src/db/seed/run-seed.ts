import path from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../../config.ts';
import * as schema from '../../db/schema.ts';
import { loadGpkgToStaging } from './01-load.ts';
import { insertAndTransformData } from './02-insert.ts';
import { validateSeed } from './03-validate.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedDir = path.resolve(__dirname, '../../../seed');
const gpkgPath = path.join(seedDir, 'ankara-seed.gpkg');
const manifestPath = path.join(seedDir, 'seed-manifest.json');

// DDL / Migrator yetkisine sahip veritabanı bağlantısı
const dbUrl = process.env.NETWORK_DATABASE_URL || config.NETWORK_APP_DATABASE_URL;
const seedPool = new Pool({ connectionString: dbUrl });
const seedDb = drizzle(seedPool, { schema });

async function run(): Promise<void> {
  console.log('====================================================');
  console.log('CBS, Şebeke ve Harita Modülü (network-service) Seed');
  console.log('====================================================');

  const start = Date.now();

  try {
    await loadGpkgToStaging(seedDb, gpkgPath, dbUrl, console.log);
    await insertAndTransformData(seedDb, console.log);
    await validateSeed(seedDb, manifestPath, console.log);

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log('====================================================');
    console.log(`Seed işlemi ${duration} saniyede başarıyla tamamlandı.`);
    console.log('====================================================');
    await seedPool.end();
    process.exit(0);
  } catch (err) {
    console.error('Seed işlemi sırasında hata oluştu:', err);
    await seedPool.end();
    process.exit(1);
  }
}

void run();
