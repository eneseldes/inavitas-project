import { UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
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

/**
 * SSE bağlantıları (tarayıcının `EventSource` API'si) özel header gönderemez;
 * bu yüzden canlı akış (`/stream`) uç noktalarında token query param'dan da
 * kabul edilir. Diğer tüm uç noktalarda yalnızca Authorization header geçerlidir.
 */
function tokenFromStreamQuery(req: Request): string | undefined {
  if (!req.path.endsWith('/stream')) return undefined;
  const token = req.query.access_token;
  return typeof token === 'string' ? token : undefined;
}

/** `Authorization: Bearer <token>` başlığını doğrular ve kullanıcı kimliğini `req.user` alanına atar. */
export function requireAuth() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : tokenFromStreamQuery(req);

    if (!token) {
      next(new UnauthenticatedError('Authorization header eksik veya hatalı biçimde'));
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
