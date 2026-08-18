import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import fs from 'fs';

export interface SeedManifest {
  version: string;
  build_time: string;
  script_version: string;
  nearest_unit_path_ratio: number;
  customer_kofra_path_mismatch_count: number;
  row_counts: Record<string, number>;
}

/**
 * `network_db` veritabanındaki satır sayıları ile `seed-manifest.json` değerlerini karşılaştırır.
 */
export async function validateSeed(
  db: NodePgDatabase<any>,
  manifestPath: string,
  log: (msg: string) => void,
): Promise<void> {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Seed manifest dosyası bulunamadı: ${manifestPath}`);
  }

  const manifest: SeedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  log(`[03-validate] Manifest sürümü: ${manifest.version}, Build: ${manifest.build_time}`);

  if (manifest.version !== '3.0') {
    throw new Error(`Geçersiz manifest sürümü: ${manifest.version}. Beklenen sürüm: 3.0`);
  }

  log('[03-validate] Veritabanı satır sayıları doğrulanıyor...');

  const counts: Record<string, number> = {};

  const adminUnitsRes = await db.execute(sql`SELECT count(*)::int AS count FROM network.units;`);
  counts.admin_units = Number(adminUnitsRes.rows[0].count);

  const componentsRes = await db.execute(sql`SELECT count(*)::int AS count FROM network.components;`);
  counts.components = Number(componentsRes.rows[0].count);

  const edgesRes = await db.execute(sql`SELECT count(*)::int AS count FROM network.topology_edges;`);
  counts.topology_edges = Number(edgesRes.rows[0].count);

  const ringsRes = await db.execute(sql`SELECT count(*)::int AS count FROM network.rings;`);
  counts.rings = Number(ringsRes.rows[0].count);

  const customersRes = await db.execute(sql`SELECT count(*)::int AS count FROM customer.customers;`);
  counts.customers = Number(customersRes.rows[0].count);

  const piiRes = await db.execute(sql`SELECT count(*)::int AS count FROM customer.customer_pii;`);
  counts.customer_pii = Number(piiRes.rows[0].count);

  let hasError = false;
  for (const [table, expected] of Object.entries(manifest.row_counts)) {
    if (table === 'seed_manifest') continue;
    const actual = counts[table];
    if (actual !== expected) {
      log(`[03-validate] HATA: Tablo '${table}' - Beklenen: ${expected}, Gerçekleşen: ${actual}`);
      hasError = true;
    } else {
      log(`[03-validate] OK: Tablo '${table}': ${actual} satır (Birebir eşleşti)`);
    }
  }

  // unit_path IS NULL kontrolü
  const nullUnitPathsRes = await db.execute(
    sql`SELECT count(*)::int AS count FROM network.components WHERE unit_path IS NULL;`,
  );
  const nullUnitPathsCount = Number(nullUnitPathsRes.rows[0].count);

  if (nullUnitPathsCount !== 0) {
    log(`[03-validate] HATA: network.components içinde ${nullUnitPathsCount} satırda unit_path NULL!`);
    hasError = true;
  } else {
    log('[03-validate] OK: network.components unit_path IS NULL sayısı: 0');
  }

  if (hasError) {
    throw new Error('Seed doğrulama testi başarısız oldu! Yukarıdaki hataları inceleyin.');
  }

  log('[03-validate] Seed doğrulama testi BAŞARIYLA TAMAMLANDI. Tüm sayımlar manifest ile 1:1 eşleşiyor.');
}
