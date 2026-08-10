import { AUTH_COOKIE_NAMES, UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { NextFunction, Response } from 'express';
import { toAuthenticatedUser, verifyAccessToken } from '../domain/tokens.ts';

/** `access_token` çerezini doğrular (gateway'in `x-user-*` enjeksiyonundan bağımsız ikinci kontrol). */
export function authenticate() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const token = req.cookies?.[AUTH_COOKIE_NAMES.ACCESS];

    if (typeof token !== 'string' || !token) {
      next(new UnauthenticatedError('Oturum çerezi eksik veya hatalı biçimde'));
      return;
    }

    try {
      req.user = toAuthenticatedUser(verifyAccessToken(token));
      next();
    } catch {
      next(new UnauthenticatedError('Token geçersiz veya süresi dolmuş'));
    }
  };
}
