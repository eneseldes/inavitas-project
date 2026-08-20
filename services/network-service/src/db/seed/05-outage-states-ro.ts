/**
 * `network.outage_states_ro` read-model'ini `outage_db`'den tek seferlik doldurur.
 *
 * `outage-service`'teki `network-components-ro` betiğinin **tersi** yöndeki eşidir: orada
 * şebeke envanteri kesintiye kopyalanır, burada aktif kesintiler şebekeye.
 *
 * Neden gerekli: bu özellik açılmadan önce açılmış kesintiler hiçbir Kafka olayı üretmeyecek,
 * dolayısıyla read-model'e hiç düşmeyecek ve asla enerjisizlik yaratmayacaktı. Geliştirme
 * ortamı sıfırdan kurulduğu için genelde no-op'tur — ama betik **olmak zorundadır**.
 *
 * Cross-DB FK yasağı ihlal edilmiyor: bu bir kopya (read-model), bir bağ değil. Runtime'da
 * `outage_db`'ye hiç bağlanılmaz; bağlantı yalnız bu ops betiğinde açılır.
 *
 * Seed sırası: `network` seed'i önce, `outage`/`work-order` seed'i sonra, bu betik **en
 * sonda** — kaynağı `outage_db`'dir.
 */

import { Pool } from 'pg';

/** Tek `INSERT` ifadesine sığdırılacak satır sayısı. */
const CHUNK_SIZE = 1_000;

/** Enerjisizlik yaratan tek durum; `ENERGIZED`/`ARCHIVED`/`CANCELLED` kopyalanmaz. */
const ACTIVE_STATUS = 'STARTED';

interface OutageStateRow {
  id: string;
  cbs_id: string;
  status: string;
  started_at: Date;
}

export async function seedOutageStatesRo(
  targetUrl: string,
  outageUrl: string,
  log: (msg: string) => void,
): Promise<number> {
  const outagePool = new Pool({ connectionString: outageUrl });
  const targetPool = new Pool({ connectionString: targetUrl });

  try {
    log('[outage-states-ro] outage_db okunuyor...');
    const { rows } = await outagePool.query<OutageStateRow>(
      `SELECT id, cbs_id, status, started_at FROM outages WHERE status = $1`,
      [ACTIVE_STATUS],
    );
    log(`[outage-states-ro] ${rows.length} aktif kesinti okundu, yazılıyor...`);

    await targetPool.query('TRUNCATE TABLE network.outage_states_ro');

    const COLUMN_COUNT = 4;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, idx) => {
        const base = idx * COLUMN_COUNT;
        values.push(row.id, row.cbs_id, row.status, row.started_at);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });

      await targetPool.query(
        `INSERT INTO network.outage_states_ro (outage_id, cbs_id, status, started_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (outage_id) DO NOTHING`,
        values,
      );
    }

    log(`[outage-states-ro] ${rows.length} satır yazıldı.`);
    return rows.length;
  } finally {
    await outagePool.end();
    await targetPool.end();
  }
}
