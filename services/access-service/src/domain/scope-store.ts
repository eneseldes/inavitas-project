/**
 * Kapsam kümelerinin Redis tarafı: token'a sığmayan kümeler ve gateway'in bayat token
 * kontrolü için sürüm kaydı.
 */
import ms from 'ms';
import { randomUUID } from 'node:crypto';
import { scopeKeys, type ScopeMap } from '@inavitas/shared';
import { config } from '../config.ts';
import { redis } from '../redis.ts';

/**
 * Kapsam kümesi bu eşiği aşarsa token'a gömülmez, Redis'e yazılıp yerine bir referans
 * konur. Bir yönetici onlarca mahalleye tek tek yetkilendirilirse JWT çereze sığmayacak
 * kadar büyür; kapsamın kendisi zaten sunucuda duruyor, taşınması zorunlu değil.
 */
export const SCOPE_INLINE_LIMIT = 40;

function ttlSeconds(): number {
  return Math.max(1, Math.round(ms(config.JWT_REFRESH_TTL as ms.StringValue) / 1000));
}

/** Kapsam kümesindeki toplam (izin, bölge) çifti sayısı. */
export function scopeSize(scopes: ScopeMap): number {
  return Object.values(scopes).reduce((total, paths) => total + paths.length, 0);
}

/** Büyük bir kapsam kümesini Redis'e yazar ve token'a konacak referansı döner. */
export async function storeScopes(scopes: ScopeMap): Promise<string> {
  const ref = randomUUID();
  await redis.set(scopeKeys.reference(ref), JSON.stringify(scopes), 'EX', ttlSeconds());
  return ref;
}

/** Referans moduyla yazılmış kapsam kümesini geri okur. */
export async function loadScopes(ref: string): Promise<ScopeMap | undefined> {
  const raw = await redis.get(scopeKeys.reference(ref));
  if (!raw) return undefined;
  return JSON.parse(raw) as ScopeMap;
}

/**
 * Kullanıcının güncel kapsam sürümünü yayınlar.
 *
 * Gateway veritabanına bağlanmaz; bayat token'ı ancak buradan öğrenebilir. Kayıt yoksa
 * gateway "hiç değişmemiş" kabul eder — bu yüzden değer her giriş/yenilemede de tazelenir,
 * sadece kapsam değiştiğinde değil.
 */
export async function publishScopeVersion(userId: string, version: number): Promise<void> {
  await redis.set(scopeKeys.version(userId), String(version), 'EX', ttlSeconds());
}
