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

/** `Authorization: Bearer <token>` başlığını doğrular ve kullanıcı kimliğini `req.user` alanına atar. */
export function requireAuth() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');

    if (!header?.startsWith('Bearer ')) {
      next(new UnauthenticatedError('Authorization header eksik veya hatalı biçimde'));
      return;
    }

    try {
      const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
      req.user = { id: payload.sub, email: payload.email, roles: payload.roles, permissions: payload.perms };
      next();
    } catch {
      next(new UnauthenticatedError('Token geçersiz veya süresi dolmuş'));
    }
  };
}
