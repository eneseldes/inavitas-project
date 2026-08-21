/**
 * Yük testi — tile üretimi, graf sorguları ve poligon sorgusu.
 *
 * Kabul ölçütlerindeki performans hedeflerini (bkz. `onceden-yapilanlar.md` §14) **çalışan bir
 * sistem üzerinde** ölçer. Bir birim testi değildir: `npm test` bunu çalıştırmaz, altyapı
 * ayakta olmalı ve veritabanı seed'lenmiş olmalıdır.
 *
 * ```bash
 * npm run load-test                       # varsayılan: http://localhost (nginx ön proxy)
 * LOAD_TEST_BASE_URL=http://localhost:8080 npm run load-test   # doğrudan gateway (dev)
 * LOAD_TEST_CONCURRENCY=16 LOAD_TEST_ITERATIONS=400 npm run load-test
 * ```
 *
 * ⚠️ **Yeni bağımlılık eklenmedi.** `autocannon`/`k6` gibi bir araç bu ölçüm için
 * gereğinden fazlası: ihtiyacımız olan şey bir eşzamanlılık havuzu ve yüzdelik hesabı, ikisi
 * de Node'un kendi `fetch`'iyle yazılabiliyor. Ölçüm istemci tarafındadır, yani ağ + gateway
 * + servis toplamını görürüz — kullanıcının gördüğü sayı da budur.
 *
 * Bir senaryo hedefini aşarsa çıkış kodu 1'dir (`scripts/reconcile.ts` ile aynı desen).
 */

const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? 'http://localhost';
const EMAIL = process.env.LOAD_TEST_EMAIL ?? 'admin@inavitas.com';
const PASSWORD = process.env.LOAD_TEST_PASSWORD ?? 'Admin123!';
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY ?? 8);
const ITERATIONS = Number(process.env.LOAD_TEST_ITERATIONS ?? 200);

/**
 * Çapa eleman — `onceden-yapilanlar.md` §6'daki doğrulanmış değer: downstream 1.934 eleman ·
 * 707 abone. Sabit tutulur ki iki ölçüm karşılaştırılabilir olsun.
 */
const ANCHOR_COMPONENT_ID = process.env.LOAD_TEST_COMPONENT_ID ?? '100196';

/** Ankara merkezini kapsayan, gerçek bir alan seçimi büyüklüğünde poligon. */
const AREA_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [32.80, 39.90],
      [32.90, 39.90],
      [32.90, 39.96],
      [32.80, 39.96],
      [32.80, 39.90],
    ] as [number, number][],
  ],
};

/**
 * Ölçülen tile kareleri. z14 kent ölçeği, z16 sokak ölçeğidir; ikisi farklı LOD dallarına
 * düşer (bkz. modules/tiles/zoom-lod.ts) ve maliyetleri karşılaştırılabilir değildir.
 */
const TILE_COORDS = [
  { z: 14, x: 9631, y: 6084 },
  { z: 14, x: 9632, y: 6084 },
  { z: 14, x: 9631, y: 6085 },
  { z: 14, x: 9632, y: 6085 },
  { z: 16, x: 38527, y: 24337 },
  { z: 16, x: 38528, y: 24337 },
  { z: 16, x: 38527, y: 24338 },
  { z: 16, x: 38528, y: 24338 },
];

interface Scenario {
  name: string;
  /** Kabul ölçütündeki p95 hedefi (ms); hedefi olmayan senaryolar yalnız raporlanır. */
  targetP95Ms?: number;
  run: (iteration: number) => Promise<void>;
}

interface ScenarioResult {
  name: string;
  targetP95Ms?: number;
  samples: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

// --- Oturum ---------------------------------------------------------------

let cookieHeader = '';
let csrfToken = '';

/**
 * Giriş yapar ve çerezleri saklar.
 *
 * Token'lar `httpOnly` çerezdedir (bkz. README "Kimlik Doğrulama ve Güvenlik"); bu betik de
 * tarayıcı gibi davranır — `Set-Cookie` toplanır, mutasyonlarda `csrf_token` çerezi
 * `X-CSRF-Token` başlığı olarak geri gönderilir.
 */
async function login(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`Giriş başarısız (${res.status}): ${await res.text()}`);
  }

  const cookies = res.headers.getSetCookie();
  cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');

  const csrf = cookies.find((c) => c.startsWith('csrf_token='));
  csrfToken = csrf ? decodeURIComponent(csrf.split(';')[0]!.slice('csrf_token='.length)) : '';

  if (!cookieHeader.includes('access_token=')) {
    throw new Error('Giriş yanıtında access_token çerezi yok — gateway/access-service zinciri kontrol edilmeli.');
  }
}

async function get(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookieHeader } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  // Gövde tüketilmezse bağlantı havuzda tutulur ve eşzamanlılık sahte biçimde düşer.
  await res.arrayBuffer();
}

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  await res.arrayBuffer();
}

// --- Ölçüm ----------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

/**
 * Senaryoyu sabit eşzamanlılıkla `ITERATIONS` kez koşturur.
 *
 * Havuz deseni bilerek "bitince yenisini al"dır, "hepsini birden başlat" değil: ikincisi
 * sunucuya 200 isteği aynı anda vurur, kuyruk gecikmesini ölçer ve p95'i anlamsız kılar.
 */
async function measure(scenario: Scenario): Promise<ScenarioResult> {
  const durations: number[] = [];
  let errors = 0;
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const iteration = next++;
      if (iteration >= ITERATIONS) return;

      const startedAt = process.hrtime.bigint();
      try {
        await scenario.run(iteration);
        durations.push(Number(process.hrtime.bigint() - startedAt) / 1e6);
      } catch {
        errors++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const sorted = [...durations].sort((a, b) => a - b);
  return {
    name: scenario.name,
    targetP95Ms: scenario.targetP95Ms,
    samples: sorted.length,
    errors,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? 0,
  };
}

/** ⚠️ `direction` zorunlu bir sorgu parametresidir; olmadan uç 400 döner. */
function tracePath(direction: 'up' | 'down'): string {
  return `/api/network/components/${ANCHOR_COMPONENT_ID}/trace?direction=${direction}`;
}

function tilePath(iteration: number): string {
  const { z, x, y } = TILE_COORDS[iteration % TILE_COORDS.length]!;
  return `/api/network/tiles/${z}/${x}/${y}.mvt`;
}

async function main(): Promise<void> {
  console.log(`Yük testi → ${BASE_URL} (eşzamanlılık ${CONCURRENCY}, tekrar ${ITERATIONS})\n`);
  await login();

  // Isıtma turu ölçülmez: ilk tile'lar cache'i doldurur, ilk graf sorgusu JIT'i ısıtır.
  // Ölçülseydi "cache-hit" senaryosu ıskaları da içerirdi.
  for (let i = 0; i < TILE_COORDS.length; i++) await get(tilePath(i));
  await get(tracePath('down'));

  const scenarios: Scenario[] = [
    {
      name: 'tile (cache-hit)',
      targetP95Ms: 30,
      run: (i) => get(tilePath(i)),
    },
    {
      name: 'tile (cache-miss)',
      targetP95Ms: 400,
      // Her tekrar farklı bir kare ister; cache asla ısınmaz. Kareler ısıtma turundakilerden
      // uzakta seçilir ki ısıtma bu senaryoyu kirletmesin.
      run: (i) => get(`/api/network/tiles/14/${9600 + (i % 64)}/${6060 + Math.floor(i / 64)}.mvt`),
    },
    {
      name: 'graf: downstream trace',
      // Hedef saf graf gezinmesi için 50 ms; bu senaryo uçtan uca ölçtüğü için (gateway +
      // bbox sorgusu + vurgu kümesinin Redis'e yazılması) daha geniş bir sınır kullanılır.
      // Saf gezinme süresi `network_graph_traverse_seconds{kind="downstream"}` metriğinde.
      targetP95Ms: 300,
      run: () => get(tracePath('down')),
    },
    {
      name: 'graf: upstream zincir',
      targetP95Ms: 300,
      run: () => get(tracePath('up')),
    },
    {
      name: 'graf: etki önizleme',
      targetP95Ms: 300,
      run: () => get(`/api/network/components/${ANCHOR_COMPONENT_ID}/impact-preview`),
    },
    {
      name: 'poligon: alan sorgusu',
      run: () => post('/api/network/query/within', { polygon: AREA_POLYGON, page: 1, pageSize: 50 }),
    },
  ];

  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.name} … `);
    const result = await measure(scenario);
    results.push(result);
    console.log(`p95 ${result.p95.toFixed(1)} ms`);
  }

  console.log('\n| Senaryo | Örnek | Hata | p50 | p95 | p99 | max | Hedef |');
  console.log('|---|---|---|---|---|---|---|---|');

  let failed = false;
  for (const r of results) {
    const target = r.targetP95Ms ? `${r.targetP95Ms} ms` : '—';
    const verdict = r.targetP95Ms === undefined ? '' : r.p95 <= r.targetP95Ms ? ' ✅' : ' ❌';
    if (r.errors > 0 || (r.targetP95Ms !== undefined && r.p95 > r.targetP95Ms)) failed = true;

    console.log(
      `| ${r.name} | ${r.samples} | ${r.errors} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ` +
        `${r.p99.toFixed(1)} | ${r.max.toFixed(1)} | ${target}${verdict} |`,
    );
  }

  if (failed) {
    console.error('\nEn az bir senaryo hedefi aştı ya da hata verdi.');
    process.exit(1);
  }

  console.log('\nTüm hedefler tutuyor.');
}

main().catch((err: unknown) => {
  console.error('Yük testi çalıştırılamadı:', err instanceof Error ? err.message : err);
  process.exit(1);
});
