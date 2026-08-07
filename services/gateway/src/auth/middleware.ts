import { UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from './verify-token.ts';

const SPOOFABLE_HEADERS = ['x-user-id', 'x-user-email', 'x-user-roles', 'x-user-permissions'];

/**
 * Dışarıdan gelen `X-User-*` header'larını siler (spoofing koruması).
 *
 * ⚠️ Bu, requireAuth()'tan ÖNCE ve PUBLIC route'larda DAHİL her zaman
 * çalışmalı — login isteğine sızmış bir `X-User-Id` header'ı downstream'e
 * kadar hayatta kalmamalı (02-MIMARI 2.2: "önce sil, sonra yaz").
 */
export function stripSpoofedHeaders() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const header of SPOOFABLE_HEADERS) delete req.headers[header];
    next();
  };
}

/** `Authorization: Bearer <token>`i doğrular, kimliği `req.user`a yazar. */
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
      // Süresi dolmuş / imzası bozuk / yanlış tip — hepsi tek cevap (access-service ile aynı gerekçe).
      next(new UnauthenticatedError('Token geçersiz veya süresi dolmuş'));
    }
  };
}
