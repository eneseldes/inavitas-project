import { describe, expect, it } from 'vitest';
import { ALL_NAMESPACES, buildBundleCacheKey, buildEtag, buildVersionCacheKey } from '../src/domain/cache-key.ts';

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

  it('namespace verilmeyen toplu istek için ALL_NAMESPACES sentinel değeri kullanılır (E3)', () => {
    const key = buildBundleCacheKey('tr-TR', ALL_NAMESPACES, 7);
    expect(key).toBe('i18n:bundle:tr-TR:__all__:v7');

    const etag = buildEtag('tr-TR', ALL_NAMESPACES, 7);
    expect(etag).toBe('"tr-TR:__all__:v7"');
  });

  it('yayın öncesi (v0) ve sonrası (v1) ETag farklıdır', () => {
    // Hiç yayınlanmamış paketin versiyonu 0'dır (bkz. translation.repository.ts
    // getBundleVersion); ilk publish v1'e çıkarır. Bu farkın oluşması, istemcinin
    // ilk yayını 304 ile yutmaması için kritiktir.
    const beforePublish = buildEtag('tr-TR', 'outage', 0);
    const afterPublish = buildEtag('tr-TR', 'outage', 1);
    expect(beforePublish).not.toBe(afterPublish);
  });
});
