import { describe, expect, it } from 'vitest';
import { buildBundleCacheKey, buildEtag, buildVersionCacheKey } from '../src/domain/cache-key.ts';

describe('cache-key domain helpers', () => {
  it('buildBundleCacheKey doğru formatta anahtar üretir', () => {
    const key = buildBundleCacheKey('tr-TR', 'outage', 42);
    expect(key).toBe('i18n:bundle:tr-TR:outage:v42');
  });

  it('buildVersionCacheKey doğru formatta anahtar üretir', () => {
    const key = buildVersionCacheKey('en-US', 'work-order');
    expect(key).toBe('i18n:ver:en-US:work-order');
  });

  it('buildEtag tırnak işaretli doğru ETag header değeri üretir', () => {
    const etag = buildEtag('tr-TR', 'outage', 5);
    expect(etag).toBe('"tr-TR:outage:v5"');
  });
});
