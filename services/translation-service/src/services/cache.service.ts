import type { Logger } from '@inavitas/shared';
import { ALL_NAMESPACES, buildBundleCacheKey, buildVersionCacheKey } from '../domain/cache-key.ts';
import type { Dictionary } from '../domain/bundle.ts';
import { redis } from '../redis.ts';
import * as repo from '../repository/translation.repository.ts';

const BUNDLE_TTL_SECONDS = 86400; // 24 saat
const VERSION_TTL_SECONDS = 60; // 60 saniye
const META_TTL_SECONDS = 60;
const LOCALES_META_KEY = 'i18n:meta:locales';
const NAMESPACES_META_KEY = 'i18n:meta:namespaces';

/** Önbellekten versiyonlanmış çeviri paketini okur. Redis hatasında null döner (sessiz düşüş). */
export async function getBundle(
  locale: string,
  namespace: string,
  version: number,
  log: Logger,
): Promise<Dictionary | null> {
  try {
    const key = buildBundleCacheKey(locale, namespace, version);
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as Dictionary;
  } catch (err) {
    log.error({ err, locale, namespace }, 'Redis getBundle hatası, DB fallback yapılıyor');
    return null;
  }
}

/** Çeviri paketini versiyonlu anahtar ile Redis'e yazar. */
export async function setBundle(
  locale: string,
  namespace: string,
  version: number,
  bundle: Dictionary,
  log: Logger,
): Promise<void> {
  try {
    const key = buildBundleCacheKey(locale, namespace, version);
    await redis.set(key, JSON.stringify(bundle), 'EX', BUNDLE_TTL_SECONDS);
  } catch (err) {
    log.error({ err, locale, namespace }, 'Redis setBundle hatası');
  }
}

/** Güncel bundle versiyonunu okur (önce Redis, yoksa DB). */
export async function getBundleVersion(locale: string, namespace: string, log: Logger): Promise<number> {
  try {
    const verKey = buildVersionCacheKey(locale, namespace);
    const cachedVer = await redis.get(verKey);
    if (cachedVer) {
      return parseInt(cachedVer, 10);
    }

    const dbVer = await repo.getBundleVersion(locale, namespace);
    await redis.set(verKey, dbVer.toString(), 'EX', VERSION_TTL_SECONDS);
    return dbVer;
  } catch (err) {
    log.error({ err, locale, namespace }, 'Redis getBundleVersion hatası, DB fallback yapılıyor');
    return repo.getBundleVersion(locale, namespace);
  }
}

/** Bir dilin TÜM namespace'lerdeki toplam bundle versiyonunu okur (önce Redis, yoksa DB) — E3. */
export async function getAggregateBundleVersion(locale: string, log: Logger): Promise<number> {
  try {
    const verKey = buildVersionCacheKey(locale, ALL_NAMESPACES);
    const cachedVer = await redis.get(verKey);
    if (cachedVer) {
      return parseInt(cachedVer, 10);
    }

    const dbVer = await repo.getAggregateBundleVersion(locale);
    await redis.set(verKey, dbVer.toString(), 'EX', VERSION_TTL_SECONDS);
    return dbVer;
  } catch (err) {
    log.error({ err, locale }, 'Redis getAggregateBundleVersion hatası, DB fallback yapılıyor');
    return repo.getAggregateBundleVersion(locale);
  }
}

/**
 * Publish sonrası çağrılır — aksi halde SSE sinyali gelse bile sunucu
 * `i18n:ver:*` anahtarındaki 60 sn'lik eski versiyonu dönmeye devam eder.
 */
export async function invalidateBundleVersion(locale: string, namespace: string, log: Logger): Promise<void> {
  try {
    await redis.del(buildVersionCacheKey(locale, namespace));
  } catch (err) {
    log.error({ err, locale, namespace }, 'Redis invalidateBundleVersion hatası (TTL ile kendiliğinden toparlanır)');
  }
}

/**
 * Aktif dil kodlarını beyaz liste olarak döner (60 sn Redis cache'i).
 * Public `/bundle` ucuna verilen keyfi `locale` değeri sınırsız Redis anahtarı
 * ürettirmesin diye (bkz. D29) — bilinmeyen değer asla cache anahtarına dönüşmez.
 */
export async function getActiveLocaleCodes(log: Logger): Promise<string[]> {
  try {
    const cached = await redis.get(LOCALES_META_KEY);
    if (cached) return JSON.parse(cached) as string[];

    const rows = await repo.listActiveLocales();
    const codes = rows.map((r) => r.code);
    await redis.set(LOCALES_META_KEY, JSON.stringify(codes), 'EX', META_TTL_SECONDS);
    return codes;
  } catch (err) {
    log.error({ err }, 'Redis getActiveLocaleCodes hatası, DB fallback yapılıyor');
    return (await repo.listActiveLocales()).map((r) => r.code);
  }
}

/** Namespace adlarını beyaz liste olarak döner (60 sn Redis cache'i) — bkz. D29. */
export async function getNamespaceNames(log: Logger): Promise<string[]> {
  try {
    const cached = await redis.get(NAMESPACES_META_KEY);
    if (cached) return JSON.parse(cached) as string[];

    const rows = await repo.listNamespaces();
    const names = rows.map((r) => r.name);
    await redis.set(NAMESPACES_META_KEY, JSON.stringify(names), 'EX', META_TTL_SECONDS);
    return names;
  } catch (err) {
    log.error({ err }, 'Redis getNamespaceNames hatası, DB fallback yapılıyor');
    return (await repo.listNamespaces()).map((r) => r.name);
  }
}
