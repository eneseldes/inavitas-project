import { RateLimitedError, type Redis } from '@inavitas/shared';
import type { NextFunction, Request, Response } from 'express';

const WINDOW_SECONDS = 60;
const MAX_ATTEMPTS = 10;

/**
 * Login uç noktası için IP başına sabit pencereli (fixed window) hız sınırlama
 * (03-YOL-HARITASI Faz 5 adım 2): dakikada 10 deneme.
 */
export function loginRateLimiter(redis: Redis) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const key = `ratelimit:login:${req.ip ?? 'unknown'}`;

    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, WINDOW_SECONDS);

    if (attempts > MAX_ATTEMPTS) {
      next(new RateLimitedError('Çok fazla giriş denemesi, bir dakika sonra tekrar deneyin'));
      return;
    }

    next();
  };
}
