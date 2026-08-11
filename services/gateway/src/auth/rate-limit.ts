import { RateLimitedError, type Redis } from '@inavitas/shared';
import type { NextFunction, Request, Response } from 'express';

const WINDOW_SECONDS = 60;
const MAX_ATTEMPTS = 10;

/**
 * Giriş (login) uç noktası için IP bazlı hız sınırlaması (rate limiting) uygular (dakikada 10 deneme).
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

const BUNDLE_WINDOW_SECONDS = 60;
const BUNDLE_MAX_ATTEMPTS = 60;

/**
 * `/api/translations/bundle` ve `/api/translations/locales` auth'suz erişilebilen tek
 * uçlardır — IP bazlı hız sınırlaması uygular (dakikada 60 istek), loginRateLimiter ile
 * birebir aynı desen.
 */
export function bundleRateLimiter(redis: Redis) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const key = `ratelimit:bundle:${req.ip ?? 'unknown'}`;

    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, BUNDLE_WINDOW_SECONDS);

    if (attempts > BUNDLE_MAX_ATTEMPTS) {
      next(new RateLimitedError('Çok fazla istek, bir dakika sonra tekrar deneyin'));
      return;
    }

    next();
  };
}
