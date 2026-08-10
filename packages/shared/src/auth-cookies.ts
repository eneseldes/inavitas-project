import type { CookieOptions } from 'express';

/** Kimlik doğrulama çerezlerinin adları. */
export const AUTH_COOKIE_NAMES = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
  CSRF: 'csrf_token',
} as const;

/** Çift-gönderim (double-submit) CSRF doğrulamasında beklenen istek başlığı. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Refresh token yalnızca `/api/auth/*` uç noktalarına gönderilir. */
export const REFRESH_COOKIE_PATH = '/api/auth';

export interface AuthCookieTtls {
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

/** `secure` çağıran taraftan gelir (`NODE_ENV`e değil `COOKIE_SECURE`e bağlı — HTTPS yoksa açmayın). */
export function buildAuthCookieOptions(
  secure: boolean,
  ttls: AuthCookieTtls,
): { access: CookieOptions; refresh: CookieOptions; csrf: CookieOptions } {
  return {
    access: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: ttls.accessMaxAgeMs,
    },
    refresh: {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: ttls.refreshMaxAgeMs,
    },
    // JS tarafından okunup header olarak geri gönderilmesi gerektiğinden httpOnly değil.
    csrf: {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: ttls.refreshMaxAgeMs,
    },
  };
}

/** `res.clearCookie()` için — set edilirken kullanılan `path`/`sameSite` ile eşleşmeli. */
export function clearAuthCookieOptions(secure: boolean): { access: CookieOptions; refresh: CookieOptions; csrf: CookieOptions } {
  return {
    access: { httpOnly: true, secure, sameSite: 'lax', path: '/' },
    refresh: { httpOnly: true, secure, sameSite: 'strict', path: REFRESH_COOKIE_PATH },
    csrf: { httpOnly: false, secure, sameSite: 'lax', path: '/' },
  };
}
