import { AUTH_COOKIE_NAMES, UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { NextFunction, Response } from 'express';
import { loadScopes } from '../domain/scope-store.ts';
import { toAuthenticatedUser, verifyAccessToken } from '../domain/tokens.ts';

/** `access_token` çerezini doğrular (gateway'in `x-user-*` enjeksiyonundan bağımsız ikinci kontrol). */
export function authenticate() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const token = req.cookies?.[AUTH_COOKIE_NAMES.ACCESS];

    if (typeof token !== 'string' || !token) {
      next(new UnauthenticatedError('Oturum çerezi eksik veya hatalı biçimde'));
      return;
    }

    void (async () => {
      try {
        const payload = verifyAccessToken(token);
        // Referans modundaki token kapsamı taşımaz (bkz. SCOPE_INLINE_LIMIT); küme Redis'ten
        // çözülür. Çözülemezse kapsam boş kalır — "sınırsız" değil, "hiçbir bölge".
        const scopes = payload.scopeRef ? await loadScopes(payload.scopeRef) : undefined;
        req.user = toAuthenticatedUser(payload, scopes);
        next();
      } catch {
        next(new UnauthenticatedError('Token geçersiz veya süresi dolmuş'));
      }
    })();
  };
}
