/**
 * `units_ro` read-model'ini `network_db`'den tek seferlik doldurur — bir deploy adımıdır,
 * runtime kodu değildir.
 *
 * Cross-DB FK yasağı ihlal edilmiyor: bu bir kopya, bir bağ değil. Runtime'da `network_db`'ye
 * hiç bağlanılmaz; bağlantı yalnız bu betikte açılır. Senkron servisler-arası HTTP çağrısı da
 * yok — kapsam atarken "bu birim var mı" sorusu yerel tablodan cevaplanır.
 *
 * Seed sırası: `network` seed'i önce (birim ağacı orada doğar), bu betik sonra.
 *
 * İdari birimler seed verisidir ve **değişmez** (bkz. envanter yönetimi kapsam dışı); tablo
 * her çalıştırmada baştan yazılır, artımlı senkron mekanizması kurulmaz.
 */

import { Pool } from 'pg';

/** Tek `INSERT` ifadesine sığdırılacak satır sayısı. */
const CHUNK_SIZE = 1_000;
const COLUMN_COUNT = 6;

interface UnitRow {
  path: string;
  parent_path: string | null;
  level: string;
  name: string;
  province_name: string;
  district_name: string | null;
}

export async function seedUnitsRo(
  targetUrl: string,
  networkUrl: string,
  log: (msg: string) => void,
): Promise<number> {
  const networkPool = new Pool({ connectionString: networkUrl });
  const targetPool = new Pool({ connectionString: targetUrl });

  try {
    log('[units-ro] network_db okunuyor...');
    const { rows } = await networkPool.query<UnitRow>(
      `SELECT path::text, parent_path::text, level, name, province_name, district_name
       FROM network.units
       ORDER BY path`,
    );
    log(`[units-ro] ${rows.length} birim okundu, yazılıyor...`);

    await targetPool.query('TRUNCATE TABLE units_ro');

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, idx) => {
        const base = idx * COLUMN_COUNT;
        values.push(row.path, row.parent_path, row.level, row.name, row.province_name, row.district_name);
        return `($${base + 1}::ltree, $${base + 2}::ltree, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
      });

      await targetPool.query(
        `INSERT INTO units_ro (path, parent_path, level, name, province_name, district_name)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    return rows.length;
  } finally {
    await networkPool.end();
    await targetPool.end();
  }
}
