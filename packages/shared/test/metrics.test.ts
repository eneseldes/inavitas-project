import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureMetrics,
  counter,
  gauge,
  histogram,
  metricsMiddleware,
  renderMetrics,
  resetMetrics,
} from '../src/metrics.ts';

/**
 * Metrik kayıt defteri elle yazıldığı için (bkz. `src/metrics.ts` başlığı) metin biçiminin
 * doğruluğu bize ait. Prometheus bozuk bir satırda **tüm kazımayı** atar; hata sessizdir,
 * yalnız pano boş kalır.
 */

beforeEach(() => {
  resetMetrics();
});

describe('Counter', () => {
  it('etiket kümesi başına ayrı seri sayar', () => {
    const c = counter('tile_total', 'test');
    c.inc({ source: 'hit' });
    c.inc({ source: 'hit' });
    c.inc({ source: 'miss' });

    const output = renderMetrics();
    expect(output).toContain('tile_total{source="hit"} 2');
    expect(output).toContain('tile_total{source="miss"} 1');
  });

  it('etiket sırası seriyi bölmez', () => {
    // `{a,b}` ile `{b,a}` aynı seridir; aksi halde aynı sayaç iki satır olarak görünürdü.
    const c = counter('req_total', 'test');
    c.inc({ method: 'GET', status: '200' });
    c.inc({ status: '200', method: 'GET' });

    expect(renderMetrics()).toContain('} 2');
  });

  it('HELP ve TYPE satırlarını yazar', () => {
    // Ad bu dosyada tektir: kayıt defteri süreç ömrü boyunca yaşadığı için aynı adla
    // ikinci tanım İLK tanımın açıklamasını korur (bkz. aşağıdaki `register` testi).
    counter('help_ornegi_total', 'Toplam istek').inc();

    const output = renderMetrics();
    expect(output).toContain('# HELP help_ornegi_total Toplam istek');
    expect(output).toContain('# TYPE help_ornegi_total counter');
  });
});

describe('Gauge', () => {
  it('son değeri taşır, toplamaz', () => {
    const g = gauge('de_energized', 'test');
    g.set({}, 1934);
    g.set({}, 12);

    expect(renderMetrics()).toContain('de_energized 12');
  });
});

describe('Histogram', () => {
  it('kovalar kümülatiftir ve +Inf toplam sayıya eşittir', () => {
    const h = histogram('dur_seconds', 'test', [0.01, 0.1, 1]);
    h.observe({}, 0.005);
    h.observe({}, 0.05);
    h.observe({}, 5);

    const output = renderMetrics();
    expect(output).toContain('dur_seconds_bucket{le="0.01"} 1');
    expect(output).toContain('dur_seconds_bucket{le="0.1"} 2');
    expect(output).toContain('dur_seconds_bucket{le="1"} 2');
    // Son kovanın üstünde kalan gözlem yalnız +Inf'te sayılır.
    expect(output).toContain('dur_seconds_bucket{le="+Inf"} 3');
    expect(output).toContain('dur_seconds_count 3');
  });

  it('startTimer ölçtüğü süreyi saniye olarak döner', () => {
    const h = histogram('dur_seconds', 'test');
    const done = h.startTimer();
    const seconds = done({ kind: 'downstream' });

    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(renderMetrics()).toContain('dur_seconds_count{kind="downstream"} 1');
  });
});

describe('renderMetrics', () => {
  it('sabit etiketler her seriye eklenir', () => {
    configureMetrics({ service: 'network-service' });
    counter('req_total', 'test').inc({ method: 'GET' });

    expect(renderMetrics()).toContain('req_total{service="network-service",method="GET"} 1');
  });

  it('hiç gözlem almamış metrik çıktıya girmez', () => {
    counter('never_used', 'test');

    expect(renderMetrics()).not.toContain('never_used');
  });

  it('etiket değerindeki tırnak ve satır sonu kaçırılır', () => {
    // Kaçırılmazsa satır bozulur ve Prometheus kazımanın TAMAMINI atar.
    counter('req_total', 'test').inc({ route: 'a"b\nc' });

    expect(renderMetrics()).toContain('route="a\\"b\\nc"');
  });

  it('aynı adla ikinci kez tanımlanan metrik mevcut olanı döndürür', () => {
    // Modül düzeyinde tanımlanan metrikler test sırasında iki kez içe aktarılabiliyor;
    // ikinci tanım birincisinin saydıklarını görünmez kılardı.
    const first = counter('req_total', 'test');
    first.inc({}, 5);
    const second = counter('req_total', 'başka açıklama');

    expect(second).toBe(first);
    expect(renderMetrics()).toContain('req_total 5');
  });
});

describe('metricsMiddleware', () => {
  /** İsteği çalıştırıp `finish` olayını tetikler. */
  function run(
    path: string,
    routePath: string | undefined,
    statusCode = 200,
    pathPrefixes?: readonly string[],
  ): void {
    let onFinish: (() => void) | undefined;
    const req = { path, method: 'GET', baseUrl: '', route: routePath ? { path: routePath } : undefined } as Request;
    const res = {
      statusCode,
      on: (event: string, handler: () => void) => {
        if (event === 'finish') onFinish = handler;
      },
    } as unknown as Response;

    metricsMiddleware({ pathPrefixes })(req, res, vi.fn() as unknown as NextFunction);
    onFinish?.();
  }

  it('rota DESENİNİ etiketler, ham yolu değil', () => {
    // 🚨 Ham yol yazılsaydı her tile isteği yeni bir zaman serisi açar ve Prometheus'u boğardı.
    run('/network/tiles/14/9631/6084.mvt', '/network/tiles/:z/:x/:y.mvt');

    const output = renderMetrics();
    expect(output).toContain('route="/network/tiles/:z/:x/:y.mvt"');
    expect(output).not.toContain('9631');
  });

  it('eşleşmeyen istek tek bir seride toplanır', () => {
    run('/rastgele/bir/yol', undefined, 404);
    run('/baska/bir/yol', undefined, 404);

    expect(renderMetrics()).toContain('route="unmatched",status="404"} 2');
  });

  it('SSE akışı sayılır ama süre histogramına girmez', () => {
    // Bağlantı saatlerce açık kalır; kapandığında ölçülen şey gecikme değil, bağlantı ömrüdür.
    run('/api/outages/stream', '/api/outages/stream');

    const output = renderMetrics();
    expect(output).toContain('http_requests_total{method="GET",route="/api/outages/stream",status="200"} 1');
    expect(output).not.toContain('http_request_duration_seconds_count{method="GET",route="/api/outages/stream"');
  });

  it('/metrics ucunun kendisi ölçülmez', () => {
    run('/metrics', '/metrics');

    expect(renderMetrics()).not.toContain('route="/metrics"');
  });

  it('rota eşleşmeyince bilinen önek etiketlenir', () => {
    // Gateway'de proxy'ler `app.use()` ile bağlı; `req.route` hiç dolmaz ve önek listesi
    // olmadan tüm trafik tek bir `unmatched` serisinde toplanırdı.
    run('/api/network/tiles/14/9631/6084.mvt', undefined, 200, ['/api/network', '/api/outages']);

    expect(renderMetrics()).toContain('route="/api/network"');
  });

  it('listede olmayan yol `unmatched` kalır', () => {
    // 🚨 Önek yolun kendisinden TÜRETİLMEZ: rastgele yol tarayan bir bot her isteğiyle yeni
    // bir zaman serisi açardı.
    run('/wp-admin/setup.php', undefined, 404, ['/api/network']);

    expect(renderMetrics()).toContain('route="unmatched"');
    expect(renderMetrics()).not.toContain('wp-admin');
  });

  it('uzun önek kısa olanı gölgede bırakmaz', () => {
    run('/api/work-orders/123', undefined, 200, ['/api/work', '/api/work-orders']);

    expect(renderMetrics()).toContain('route="/api/work-orders"');
  });

  it('önek yalnız sınır üzerinde eşleşir', () => {
    // `/api/networking` `/api/network`'ün altı DEĞİLDİR; düz `startsWith` bunu kaçırırdı.
    run('/api/networking', undefined, 404, ['/api/network']);

    expect(renderMetrics()).toContain('route="unmatched"');
  });
});
