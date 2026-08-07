/**
 * Aktif refresh token (jti) kaydı arayüzü ve Redis tabanlı uygulaması.
 */
import { redis } from '../redis.ts';

export interface RefreshRecord {
  userId: string;
  expiresAt: Date;
}

export interface RefreshTokenStore {
  save(jti: string, record: RefreshRecord): Promise<void>;
  get(jti: string): Promise<RefreshRecord | undefined>;
  revoke(jti: string): Promise<void>;
  /** Kullanıcının tüm aktif oturumlarını (refresh token'larını) iptal eder. */
  revokeAllForUser(userId: string): Promise<void>;
}

const KEY_PREFIX = 'refresh:';

/**
 * Redis tabanlı refresh token deposu (03-YOL-HARITASI Faz 5 adım 1).
 * Süre dolumu Redis'in `EX` mekanizmasıyla yönetilir — ayrı bir temizleme
 * (cleanup) işine gerek kalmaz.
 */
export class RedisRefreshTokenStore implements RefreshTokenStore {
  async save(jti: string, record: RefreshRecord): Promise<void> {
    const ttlSeconds = Math.max(1, Math.round((record.expiresAt.getTime() - Date.now()) / 1000));
    await redis.set(KEY_PREFIX + jti, record.userId, 'EX', ttlSeconds);
  }

  async get(jti: string): Promise<RefreshRecord | undefined> {
    const key = KEY_PREFIX + jti;
    const [userId, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);

    if (!userId || ttl < 0) return undefined;

    return { userId, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  async revoke(jti: string): Promise<void> {
    await redis.del(KEY_PREFIX + jti);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const stream = redis.scanStream({ match: `${KEY_PREFIX}*`, count: 100 });

    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length === 0) continue;

      const values = await redis.mget(keys);
      const toDelete = keys.filter((_, i) => values[i] === userId);
      if (toDelete.length > 0) await redis.del(...toDelete);
    }
  }
}

export const refreshTokenStore: RefreshTokenStore = new RedisRefreshTokenStore();
