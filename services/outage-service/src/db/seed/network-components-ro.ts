/**
 * `network_components_ro` read-model'ini `network_db`'den tek seferlik doldurur.
 *
 * Neden betik, neden olay değil: envanter yönetimi kapsam dışıdır — şebeke elemanı
 * eklenmez/silinmez, dolayısıyla yayılacak bir model-mutasyon olayı yoktur.
 * Tablo veri yüklendikten sonra bir kez doldurulur ve sabit kalır.
 *
 * ⚠️ Cross-DB FK yasağı ihlal edilmiyor: bu bir kopya (read-model), bir bağ değil. Runtime'da
 * `network_db`'ye hiç bağlanılmaz; bağlantı yalnız bu ops betiğinde açılır.
 */

import { Pool } from 'pg';

/** Tek `INSERT` ifadesine sığdırılacak satır sayısı (593 bin satır gruplar hâlinde akar). */
const CHUNK_SIZE = 5_000;

interface ComponentRow {
  id: string;
  type: string;
  category: string;
  breaker_role: string | null;
  name: string | null;
  voltage_level: string;
  topology_level: number;
  unit_path: string;
  unit_name: string | null;
  lat: number;
  lon: number;
}

export async function seedNetworkComponentsRo(
  targetUrl: string,
  networkUrl: string,
  log: (msg: string) => void,
): Promise<number> {
  const networkPool = new Pool({ connectionString: networkUrl });
  const targetPool = new Pool({ connectionString: targetUrl });

  try {
    log('[network-ro] network_db okunuyor...');
    // Mahalle adı `units` tablosundan yolun kendisiyle eşleştirilerek alınır; kesinti/iş emri
    // satırında yolu her seferinde ada çevirmek zorunda kalmayalım diye denormalize ediliyor.
    const { rows } = await networkPool.query<ComponentRow>(
      `SELECT c.id, c.type, c.category, c.breaker_role, c.name, c.voltage_level, c.topology_level,
              c.unit_path::text AS unit_path, u.name AS unit_name, c.lat, c.lon
         FROM network.components c
         LEFT JOIN network.units u ON u.path = c.unit_path`,
    );
    log(`[network-ro] ${rows.length} eleman okundu, yazılıyor...`);

    await targetPool.query('TRUNCATE TABLE network_components_ro');

    const COLUMN_COUNT = 11;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, idx) => {
        const base = idx * COLUMN_COUNT;
        values.push(
          row.id,
          row.type,
          row.category,
          row.breaker_role,
          row.name,
          row.voltage_level,
          row.topology_level,
          row.unit_path,
          row.unit_name,
          row.lat,
          row.lon,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::ltree, $${base + 9}, $${base + 10}, $${base + 11})`;
      });

      await targetPool.query(
        `INSERT INTO network_components_ro
           (id, type, category, breaker_role, name, voltage_level, topology_level, unit_path, unit_name, lat, lon)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        values,
      );
    }

    log(`[network-ro] ${rows.length} satır yazıldı.`);
    return rows.length;
  } finally {
    await networkPool.end();
    await targetPool.end();
  }
}
