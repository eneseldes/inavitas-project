/**
 * Prometheus metrik kayıt defteri ve HTTP enstrümantasyonu.
 *
 * **Neden elle yazıldı?** Bu projede yeni bir bağımlılık gerekçe ister ve `prom-client`
 * yapılanın çok ötesini taşıyor (küme toplama, GC probları, pushgateway). İhtiyacımız üç
 * metrik tipi ve bir metin biçimi; ikisi de yüz satırın altında ve dışa bağımlılığı yok.
 * Metrik toplama hiçbir zaman istek yolunu bozmamalı, bu yüzden burada I/O da yoktur —
 * her şey bellekte sayılır, `/metrics` istendiğinde metne çevrilir.
 *
 * ⚠️ **Etiket kardinalitesi.** Etiket değeri kullanıcı girdisinden GELMEZ. `route` etiketi
 * Express'in eşleştirdiği **desen**tir (`/tiles/:z/:x/:y.mvt`), gerçek yol değil; aksi halde
 * her tile isteği yeni bir zaman serisi açar ve Prometheus'u boğar.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type MetricLabels = Record<string, string | number>;

/** Tüm metriklere eklenen sabit etiketler (`service` gibi). */
let constantLabels: MetricLabels = {};

/** Metrik adı → metrik. Kayıt defteri süreç başına tektir; servis tek süreç çalışır. */
const registry = new Map<string, Metric>();

interface Metric {
  readonly name: string;
  readonly help: string;
  readonly type: 'counter' | 'gauge' | 'histogram';
  render(): string[];
  /** Yalnız testler için: serileri boşaltır, kaydı düşürmez (bkz. `resetMetrics`). */
  reset(): void;
}

/** `a="1",b="2"` — etiket değerlerindeki `\`, `"` ve satır sonu kaçırılır. */
function formatLabels(labels: MetricLabels, extra?: MetricLabels): string {
  const merged = { ...constantLabels, ...labels, ...extra };
  const parts = Object.entries(merged).map(([key, value]) => {
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `${key}="${escaped}"`;
  });
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

/**
 * Etiket kümesinin seri anahtarı. Anahtar sıralı üretilir: `{a,b}` ile `{b,a}` aynı seridir,
 * aksi halde aynı sayaç iki ayrı satır olarak görünürdü.
 */
function seriesKey(labels: MetricLabels): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${String(labels[key])}`)
    .join(',');
}

/** Bir metriğin seri deposu: anahtar → (etiketler, değer). */
class SeriesStore<T> {
  protected readonly series = new Map<string, { labels: MetricLabels; value: T }>();

  reset(): void {
    this.series.clear();
  }

  protected entry(labels: MetricLabels, initial: () => T): { labels: MetricLabels; value: T } {
    const key = seriesKey(labels);
    let found = this.series.get(key);
    if (!found) {
      found = { labels, value: initial() };
      this.series.set(key, found);
    }
    return found;
  }
}

/** Yalnız artan sayaç — istek sayısı, cache isabeti, hata adedi. */
export class Counter extends SeriesStore<number> implements Metric {
  readonly type = 'counter' as const;

  constructor(
    readonly name: string,
    readonly help: string,
  ) {
    super();
  }

  inc(labels: MetricLabels = {}, value = 1): void {
    this.entry(labels, () => 0).value += value;
  }

  render(): string[] {
    return [...this.series.values()].map((s) => `${this.name}${formatLabels(s.labels)} ${s.value}`);
  }
}

/** Anlık değer — enerjisiz eleman sayısı, bekleyen planlı kesinti adedi, bellek. */
export class Gauge extends SeriesStore<number> implements Metric {
  readonly type = 'gauge' as const;

  constructor(
    readonly name: string,
    readonly help: string,
  ) {
    super();
  }

  set(labels: MetricLabels = {}, value: number): void {
    this.entry(labels, () => 0).value = value;
  }

  render(): string[] {
    return [...this.series.values()].map((s) => `${this.name}${formatLabels(s.labels)} ${s.value}`);
  }
}

/** Saniye cinsinden süre kovaları — p95 hesabı `histogram_quantile` ile Prometheus'ta yapılır. */
export const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

interface HistogramValue {
  counts: number[];
  sum: number;
  count: number;
}

/**
 * Süre dağılımı. Kabul ölçütlerindeki p95 hedefleri bu metrikten okunur
 * (bkz. `onceden-yapilanlar.md` §14).
 */
export class Histogram extends SeriesStore<HistogramValue> implements Metric {
  readonly type = 'histogram' as const;

  constructor(
    readonly name: string,
    readonly help: string,
    private readonly buckets: readonly number[] = DEFAULT_BUCKETS,
  ) {
    super();
  }

  observe(labels: MetricLabels = {}, seconds: number): void {
    const entry = this.entry(labels, () => ({
      counts: new Array<number>(this.buckets.length).fill(0),
      sum: 0,
      count: 0,
    })).value;

    // Gözlem YALNIZ düştüğü ilk kovaya yazılır; kümülatif toplama `render`'da yapılır.
    // İkisini birden yapmak kovaları şişirir ve `le="+Inf"` toplamdan küçük çıkar.
    for (let i = 0; i < this.buckets.length; i++) {
      if (seconds <= this.buckets[i]!) {
        entry.counts[i]! += 1;
        break;
      }
    }
    entry.sum += seconds;
    entry.count += 1;
  }

  /**
   * Süre ölçen bir kapanış döner: `const done = h.startTimer(); … done({ route })`.
   * Etiket ölçüm BİTİNCE verilir — sonuç (durum kodu, cache isabeti) çoğu zaman
   * başlangıçta bilinmiyor.
   */
  startTimer(): (labels?: MetricLabels) => number {
    const startedAt = process.hrtime.bigint();
    return (labels: MetricLabels = {}) => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.observe(labels, seconds);
      return seconds;
    };
  }

  render(): string[] {
    const lines: string[] = [];

    for (const s of this.series.values()) {
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        cumulative += s.value.counts[i]!;
        lines.push(`${this.name}_bucket${formatLabels(s.labels, { le: String(this.buckets[i]) })} ${cumulative}`);
      }
      lines.push(`${this.name}_bucket${formatLabels(s.labels, { le: '+Inf' })} ${s.value.count}`);
      lines.push(`${this.name}_sum${formatLabels(s.labels)} ${s.value.sum}`);
      lines.push(`${this.name}_count${formatLabels(s.labels)} ${s.value.count}`);
    }

    return lines;
  }
}

/**
 * Metriği kayıt defterine ekler. Aynı adla iki kez çağrılırsa **mevcut olan** döner:
 * modül düzeyinde tanımlanan metrikler test sırasında iki kez içe aktarılabiliyor ve
 * ikinci tanım birincisinin saydıklarını görünmez kılardı.
 */
function register<T extends Metric>(metric: T): T {
  const existing = registry.get(metric.name);
  if (existing) return existing as T;
  registry.set(metric.name, metric);
  return metric;
}

export function counter(name: string, help: string): Counter {
  return register(new Counter(name, help));
}

export function gauge(name: string, help: string): Gauge {
  return register(new Gauge(name, help));
}

export function histogram(name: string, help: string, buckets?: readonly number[]): Histogram {
  return register(new Histogram(name, help, buckets));
}

/** Servis adını tüm serilere sabit etiket olarak ekler; `index.ts` başlatmadan önce çağırır. */
export function configureMetrics(labels: MetricLabels): void {
  constantLabels = { ...labels };
}

/**
 * Yalnız testler için: tüm serileri boşaltır ve sabit etiketleri sıfırlar.
 *
 * ⚠️ Kayıt defteri **temizlenmez**, yalnız içerikleri sıfırlanır. Modül düzeyinde tanımlanan
 * metrikler (ortak HTTP metrikleri gibi) bir kez oluşturulur; kaydı düşürmek onları
 * `renderMetrics` çıktısından kalıcı olarak yok ederdi — testin ölçmek istediği şey de dahil.
 * Gözlem almamış metrik zaten çıktıya girmiyor, dolayısıyla sızıntı olmaz.
 */
export function resetMetrics(): void {
  for (const metric of registry.values()) metric.reset();
  constantLabels = {};
}

// --- Ortak HTTP metrikleri -------------------------------------------------

const httpRequests = counter('http_requests_total', 'Toplam HTTP istek sayısı');
const httpDuration = histogram('http_request_duration_seconds', 'HTTP istek süresi (saniye)');

const processHeapBytes = gauge('process_heap_used_bytes', 'V8 heap kullanımı (bayt)');
const processRssBytes = gauge('process_resident_memory_bytes', 'Yerleşik bellek kullanımı (bayt)');
const processUptime = gauge('process_uptime_seconds', 'Sürecin ayakta kalma süresi (saniye)');

export interface MetricsOptions {
  /**
   * Express'in bir rota eşleştirmediği isteklerde kullanılacak **bilinen** yol önekleri.
   *
   * Gateway için zorunludur: proxy'ler `app.use()` ile bağlandığı için `req.route` hiçbir
   * zaman dolmaz ve tüm trafik tek bir `unmatched` serisinde toplanırdı — "hangi servis
   * yavaş" sorusu gateway metriklerinden hiç cevaplanamazdı.
   *
   * ⚠️ Liste **kapalıdır**: yolun kendisinden önek türetmek (ilk iki parça gibi) sınırsız
   * kardinalite demektir, rastgele yol tarayan bir bot her isteğiyle yeni bir zaman serisi
   * açardı. Listede olmayan yol yine `unmatched`'tır.
   */
  pathPrefixes?: readonly string[];
}

/**
 * İstek sayısını ve süresini ölçer.
 *
 * Ölçüm `finish` olayında kapanır — o ana kadar Express hangi rotayı eşleştirdiğini bilir.
 * Hiçbir rota eşleşmediyse etiket bilinen bir önek ya da `unmatched`'tır: 404 tarayan bir
 * bot her yolu ayrı bir zaman serisi yapamasın.
 */
export function metricsMiddleware(options: MetricsOptions = {}): RequestHandler {
  // En uzun önek önce denenir: `/api/work-orders` ile `/api/work` bir arada verilirse
  // kısa olan uzununu gölgelemesin.
  const prefixes = [...(options.pathPrefixes ?? [])].sort((a, b) => b.length - a.length);

  const labelFor = (req: Request): string => {
    const route = (req.route as { path?: string } | undefined)?.path;
    if (route) return `${req.baseUrl}${route === '/' ? '' : route}`;

    const prefix = prefixes.find((p) => req.path === p || req.path.startsWith(`${p}/`));
    return prefix ?? 'unmatched';
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/metrics') {
      next();
      return;
    }

    const done = httpDuration.startTimer();

    res.on('finish', () => {
      const pattern = labelFor(req);
      const labels = { method: req.method, route: pattern, status: String(res.statusCode) };

      httpRequests.inc(labels);

      // ⚠️ SSE bağlantısı saatlerce açık kalır; kapandığında ölçülen şey **gecikme** değil
      // bağlantı ömrüdür. Süre histogramına yazılırsa gateway'in p95'i saatlere fırlar ve
      // hiçbir şey anlatmaz. Bağlantı SAYISI yine de sayılır (üstteki satır) — o anlamlı.
      if (pattern.endsWith('/stream')) return;

      done(labels);
    });

    next();
  };
}

/** `GET /metrics` — Prometheus metin biçimi (0.0.4). */
export function metricsHandler(): RequestHandler {
  return (_req: Request, res: Response): void => {
    const memory = process.memoryUsage();
    processHeapBytes.set({}, memory.heapUsed);
    processRssBytes.set({}, memory.rss);
    processUptime.set({}, process.uptime());

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(renderMetrics());
  };
}

/** Kayıt defterinin tamamını Prometheus metin biçimine çevirir. */
export function renderMetrics(): string {
  const lines: string[] = [];

  for (const metric of registry.values()) {
    const body = metric.render();
    if (body.length === 0) continue;

    lines.push(`# HELP ${metric.name} ${metric.help}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);
    lines.push(...body);
  }

  return `${lines.join('\n')}\n`;
}
