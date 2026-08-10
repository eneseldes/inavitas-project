import { AUTH_COOKIE_NAMES, CSRF_HEADER_NAME, UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from './verify-token.ts';

const SPOOFABLE_HEADERS = ['x-user-id', 'x-user-email', 'x-user-roles', 'x-user-permissions'];

/** Dışarıdan gelen sahte `X-User-*` header'larını temizler. */
export function stripSpoofedHeaders() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const header of SPOOFABLE_HEADERS) delete req.headers[header];
    next();
  };
}

/** `access_token` çerezini doğrular ve `req.user`'ı doldurur. */
export function requireAuth() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const token = req.cookies?.[AUTH_COOKIE_NAMES.ACCESS];

    if (typeof token !== 'string' || !token) {
      next(new UnauthenticatedError('Oturum çerezi eksik veya hatalı biçimde'));
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, email: payload.email, roles: payload.roles, permissions: payload.perms };
      next();
    } catch {
      next(new UnauthenticatedError('Token geçersiz veya süresi dolmuş'));
    }
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Çift-gönderim CSRF: `X-CSRF-Token` header'ı `csrf_token` çereziyle eşleşmeli. */
export function verifyCsrf() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const cookieToken = req.cookies?.[AUTH_COOKIE_NAMES.CSRF];
    const headerToken = req.header(CSRF_HEADER_NAME);

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      next(new UnauthenticatedError('CSRF doğrulaması başarısız'));
      return;
    }

    next();
  };
}
