import { AUTH_COOKIE_NAMES, buildAuthCookieOptions, clearAuthCookieOptions } from '@inavitas/shared';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import ms from 'ms';
import { config } from '../config.ts';

function ttls() {
  return {
    accessMaxAgeMs: ms(config.JWT_ACCESS_TTL as ms.StringValue),
    refreshMaxAgeMs: ms(config.JWT_REFRESH_TTL as ms.StringValue),
  };
}

/** Access/Refresh/CSRF çerezlerini yanıta ekler; CSRF token her seferinde yeniden üretilir. */
export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  const opts = buildAuthCookieOptions(config.COOKIE_SECURE, ttls());
  const csrfToken = randomBytes(32).toString('hex');

  res.cookie(AUTH_COOKIE_NAMES.ACCESS, tokens.accessToken, opts.access);
  res.cookie(AUTH_COOKIE_NAMES.REFRESH, tokens.refreshToken, opts.refresh);
  res.cookie(AUTH_COOKIE_NAMES.CSRF, csrfToken, opts.csrf);
}

/** Çıkışta tüm kimlik doğrulama çerezlerini temizler. */
export function clearAuthCookies(res: Response): void {
  const opts = clearAuthCookieOptions(config.COOKIE_SECURE);

  res.clearCookie(AUTH_COOKIE_NAMES.ACCESS, opts.access);
  res.clearCookie(AUTH_COOKIE_NAMES.REFRESH, opts.refresh);
  res.clearCookie(AUTH_COOKIE_NAMES.CSRF, opts.csrf);
}
