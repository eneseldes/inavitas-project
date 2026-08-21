import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Gateway metriklerindeki `route` etiketinin proxy önek listesiyle senkron kalması.
 *
 * Gateway'in asıl trafiği `app.use(buildProxy(...))` üzerinden akıyor ve orada `req.route`
 * hiçbir zaman dolmuyor: liste eksikse o servisin tüm istekleri `unmatched` serisine düşer,
 * "hangi servis yavaş / nerede 401 alıyoruz" sorusu gateway metriklerinden cevaplanamaz.
 * Bu sessiz bir kayıptır — pano boş kalmaz, yanlış dolar.
 */

const appSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../src/app.ts'),
  'utf8',
);

/** `buildProxy('/api/xxx/**', …)` çağrılarındaki yol filtrelerini toplar. */
function registeredProxyPrefixes(): string[] {
  const matches = [...appSource.matchAll(/buildProxy\(\s*'([^']+)'/g)];
  return matches.map(([, filter]) => filter!.replace(/\/\*\*$/, ''));
}

/** `PROXY_PATH_PREFIXES` dizisindeki değerler. */
function declaredPrefixes(): string[] {
  const block = /const PROXY_PATH_PREFIXES = \[([\s\S]*?)\] as const;/.exec(appSource);
  expect(block, 'PROXY_PATH_PREFIXES bulunamadı').not.toBeNull();
  return [...block![1]!.matchAll(/'([^']+)'/g)].map(([, value]) => value!);
}

describe('gateway metrik rota etiketleri', () => {
  it('her proxy öneki metrik listesinde var', () => {
    const registered = registeredProxyPrefixes();

    expect(registered.length).toBeGreaterThan(0);
    for (const prefix of registered) expect(declaredPrefixes()).toContain(prefix);
  });

  it('metrik listesinde karşılığı olmayan önek yok', () => {
    // Ters yön: kaldırılan bir proxy'nin öneki listede kalırsa etiket uzayında hiç dolmayan
    // bir değer taşınmış olur.
    const registered = registeredProxyPrefixes();

    for (const prefix of declaredPrefixes()) expect(registered).toContain(prefix);
  });

  it('middleware\'e gerçekten geçiriliyor', () => {
    expect(appSource).toContain('metricsMiddleware({ pathPrefixes: PROXY_PATH_PREFIXES })');
  });
});
