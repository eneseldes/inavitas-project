import { UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { NextFunction, Response } from 'express';
import { toAuthenticatedUser, verifyAccessToken } from '../domain/tokens.ts';

/**
 * Authorization: Bearer <token> başlığından Access Token'ı doğrular ve kullanıcı kimliğini kurulur.
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
      next(new UnauthenticatedError('Token geçersiz veya süresi dolmuş'));
    }
  };
}
