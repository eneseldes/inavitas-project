import { buildBundleCacheKey, buildVersionCacheKey } from '../domain/cache-key.ts';
import type { Dictionary } from '../domain/bundle.ts';
import { redis } from '../redis.ts';
import * as repo from '../repository/translation.repository.ts';

const BUNDLE_TTL_SECONDS = 86400; // 24 saat
const VERSION_TTL_SECONDS = 60; // 60 saniye

/** Önbellekten versiyonlanmış çeviri paketini okur. Redis hatasında null döner (sessiz düşüş). */
export async function getBundle(
  locale: string,
  namespace: string,
  version: number,
): Promise<Dictionary | null> {
  try {
    const key = buildBundleCacheKey(locale, namespace, version);
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as Dictionary;
  } catch (err) {
    console.error('[cache.service] Redis getBundle hatası (DB fallback yapılıyor):', err);
    return null;
  }
}

/** Çeviri paketini versiyonlu anahtar ile Redis'e yazar. */
export async function setBundle(
  locale: string,
  namespace: string,
  version: number,
  bundle: Dictionary,
): Promise<void> {
  try {
    const key = buildBundleCacheKey(locale, namespace, version);
    await redis.set(key, JSON.stringify(bundle), 'EX', BUNDLE_TTL_SECONDS);
  } catch (err) {
    console.error('[cache.service] Redis setBundle hatası:', err);
  }
}

/** Güncel bundle versiyonunu okur (önce Redis, yoksa DB). */
export async function getBundleVersion(locale: string, namespace: string): Promise<number> {
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
    console.error('[cache.service] Redis getBundleVersion hatası (DB fallback):', err);
    return repo.getBundleVersion(locale, namespace);
  }
}
