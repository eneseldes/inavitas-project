import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** Sekiz bantlı dolgu paleti (bkz. `--c-map-unit-band-0..7`, styles/_theme.scss). */
const BAND_COUNT = 8;

/**
 * İl/ilçe dolgu rengi bandını (0-7) komşuluk grafiğine göre çatışmasız atar.
 *
 * Eskiden `abs(hashtext(path)) % 8` ile anlık hesaplanıyordu (bkz. tiles/service.ts) —
 * komşuluğu bilmediğinden iki komşu ilçe aynı bandı alabiliyordu. Burada önce hangi
 * birimlerin sınır paylaştığı (`ST_DWithin` — basitleştirilmiş geometriler simplifikasyon
 * sonrası tam değmeyebilir, birkaç metrelik pay bırakılır) bulunur, sonra klasik açgözlü
 * grafik boyama uygulanır: birimler en çok komşusu olandan başlanarak sıralanır, her biri
 * komşularının kullanmadığı en küçük bandı alır. Dört renk teoremi düzlemsel bir grafiğin
 * en çok 4 renkle boyanabileceğini garanti eder; 8 bant açgözlü algoritmanın optimal
 * olmayışına geniş bir pay bırakır.
 *
 * İl ve ilçe bantları AYRI grafiklerde boyanır — ikisi asla aynı anda çizilmez (bkz.
 * `UNITS_PROVINCE_FILL_LAYER_ID` maxzoom 8, `UNITS_DISTRICT_FILL_LAYER_ID` minzoom 8),
 * o yüzden bir il ile bir ilçenin aynı bandı taşıması sorun değildir.
 */
export async function computeUnitColorBands(db: NodePgDatabase<any>, log: (msg: string) => void): Promise<void> {
  for (const level of ['PROVINCE', 'DISTRICT'] as const) {
    const { rows: units } = await db.execute<{ path: string }>(
      sql`SELECT path::text AS path FROM network.units WHERE level = ${level}`,
    );
    if (units.length === 0) continue;

    const { rows: edgeRows } = await db.execute<{ a: string; b: string }>(sql`
      SELECT a.path::text AS a, b.path::text AS b
      FROM network.units a
      JOIN network.units b
        ON a.path < b.path
       AND a.level = ${level} AND b.level = ${level}
       AND ST_DWithin(a.geom, b.geom, 0.0005)
    `);

    const neighbors = new Map<string, Set<string>>(units.map((u) => [u.path, new Set<string>()]));
    for (const { a, b } of edgeRows) {
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }

    // En çok komşusu olandan başlamak açgözlü boyamada daha az çakışma bırakır — kısıtlı
    // düğümler renk seçeneği azalmadan önce boyanır.
    const order = [...neighbors.keys()].sort((x, y) => neighbors.get(y)!.size - neighbors.get(x)!.size);

    const band = new Map<string, number>();
    for (const path of order) {
      const used = new Set([...neighbors.get(path)!].map((n) => band.get(n)).filter((b): b is number => b !== undefined));
      let chosen = 0;
      while (used.has(chosen) && chosen < BAND_COUNT - 1) chosen++;
      band.set(path, chosen);
    }

    for (const [path, value] of band) {
      await db.execute(sql`UPDATE network.units SET color_band = ${value} WHERE path = ${path}::ltree`);
    }

    const maxDegree = Math.max(0, ...[...neighbors.values()].map((s) => s.size));
    log(`[04-unit-color-band] ${level}: ${units.length} birim, ${edgeRows.length} komşuluk kenarı, en yüksek derece ${maxDegree}, bantlandı.`);
  }
}
