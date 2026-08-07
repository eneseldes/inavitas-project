import { UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { NextFunction, Response } from 'express';
import { toAuthenticatedUser, verifyAccessToken } from '../domain/tokens.ts';

/**
 * `Authorization: Bearer <token>` header'ından kimliği çözer.
 *
 * access-service token'ı KENDİSİ üretiyor, dolayısıyla kendisi doğrular.
 * Diğer servisler bunun yerine gateway'in eklediği header'lara güvenir
 * (`userFromHeaders`, packages/shared) — çünkü JWT'yi gateway zaten
 * bir kez doğruladı ve dış dünyadan gelen header'ları sildi.
 */
export function authenticate() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');

    if (!header?.startsWith('Bearer ')) {
      next(new UnauthenticatedError('Authorization header eksik veya hatalı biçimde'));
      return;
    }

    const token = header.slice('Bearer '.length).trim();

    try {
      req.user = toAuthenticatedUser(verifyAccessToken(token));
      next();
    } catch {
      // Süresi dolmuş / imzası bozuk / yanlış tip — hepsi tek cevap.
      next(new UnauthenticatedError('Token geçersiz veya süresi dolmuş'));
    }
  };
}
