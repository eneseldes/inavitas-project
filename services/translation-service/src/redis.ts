import { createRedisClient, type Redis } from '@inavitas/shared';
import { config } from './config.ts';

export const redis: Redis = createRedisClient(config.REDIS_URL);

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
