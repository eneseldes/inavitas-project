import { createRedisClient, type Redis } from '@inavitas/shared';
import { config } from './config.ts';

/** Genel komutlar (rate limiting) için Redis bağlantısı. */
export const redis: Redis = createRedisClient(config.REDIS_URL);

/**
 * Pub/Sub aboneliği için ayrılmış Redis bağlantısı.
 * `SUBSCRIBE` moduna giren bağlantılar genel komut kabul etmediğinden ayrı bağlantı kullanılır.
 */
export const redisSubscriber: Redis = redis.duplicate();

export async function disconnectRedis(): Promise<void> {
  await redisSubscriber.quit();
  await redis.quit();
}
