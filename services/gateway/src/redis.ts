import { createRedisClient, type Redis } from '@inavitas/shared';
import { config } from './config.ts';

/** Genel komutlar (rate limiting) için Redis bağlantısı. */
export const redis: Redis = createRedisClient(config.REDIS_URL);

/**
 * Pub/sub aboneliği için AYRI bir bağlantı (03-YOL-HARITASI Faz 5 tuzağı):
 * `subscribe` moduna giren bir bağlantı başka komut kabul etmez, bu yüzden
 * aynı client hem `INCR` hem `SUBSCRIBE` için kullanılamaz.
 */
export const redisSubscriber: Redis = redis.duplicate();

export async function disconnectRedis(): Promise<void> {
  await redisSubscriber.quit();
  await redis.quit();
}
