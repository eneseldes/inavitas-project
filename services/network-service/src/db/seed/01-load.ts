import { execSync } from 'child_process';
import fs from 'fs';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * GPKG seed artefaktını `ogr2ogr` kullanarak Postgres `staging_seed` şemasına aktarır.
 */
export async function loadGpkgToStaging(
  db: NodePgDatabase<any>,
  gpkgPath: string,
  dbUrl: string,
  log: (msg: string) => void,
): Promise<void> {
  if (!fs.existsSync(gpkgPath)) {
    throw new Error(
      `GPKG seed dosyası bulunamadı: ${gpkgPath}. Lütfen 'services/network-service/seed/ankara-seed.gpkg' dosyasını kontrol edin.`,
    );
  }

  log(`[01-load] Staging şeması oluşturuluyor (CREATE SCHEMA IF NOT EXISTS staging_seed)...`);
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS staging_seed;`);

  log(`[01-load] GPKG verisi 'staging_seed' şemasına aktarılıyor: ${gpkgPath}...`);

  // ogr2ogr komutu — hedef şema staging_seed
  const cmd = `ogr2ogr -f "PostgreSQL" PG:"${dbUrl}" "${gpkgPath}" -lco SCHEMA=staging_seed -overwrite`;
  execSync(cmd, { stdio: 'inherit' });

  log(`[01-load] 'staging_seed' şeması başarıyla dolduruldu.`);
}
