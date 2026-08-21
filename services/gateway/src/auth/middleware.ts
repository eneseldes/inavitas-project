import {
  AUTH_COOKIE_NAMES,
  CSRF_HEADER_NAME,
  ScopeStaleError,
  SCOPES_HEADER_NAME,
  scopeKeys,
  UnauthenticatedError,
  type AuthedRequest,
  type ScopeMap,
} from '@inavitas/shared';
import type { NextFunction, Request, Response } from 'express';
import { redis } from '../redis.ts';
import { verifyAccessToken } from './verify-token.ts';

/**
 * 🚨 `x-user-scopes` bu listede olmak ZORUNDA. Atlanırsa header dışarıdan enjekte edilir
 * ve tüm bölgesel yetki modeli delinir — süzme kararını alt servisler bu header'a bakarak
 * veriyor.
 */
const SPOOFABLE_HEADERS = [
  'x-user-id',
  'x-user-email',
  'x-user-roles',
  'x-user-permissions',
  SCOPES_HEADER_NAME,
];

/** Dışarıdan gelen sahte `X-User-*` header'larını temizler. */
export function stripSpoofedHeaders() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const header of SPOOFABLE_HEADERS) delete req.headers[header];
    next();
  };
}

/**
 * Token'daki kapsam kümesini çözer ve bayatlığını denetler.
 *
 * Sürüm kaydı Redis'tedir çünkü gateway veritabanına bağlanmaz. Kayıt hiç yoksa kapsam o
 * kullanıcı için henüz hiç değişmemiştir (ya da TTL dolmuştur) — token kabul edilir; aksi
 * halde Redis'in boşalması herkesi dışarı atardı.
 */
async function resolveScopes(payload: {
  sub: string;
  scopes?: ScopeMap;
  scopeRef?: string;
  scopeVersion?: number;
}): Promise<ScopeMap> {
  const current = await redis.get(scopeKeys.version(payload.sub));
  if (current !== null && Number(current) !== payload.scopeVersion) throw new ScopeStaleError();

  if (!payload.scopeRef) return payload.scopes ?? {};

  const raw = await redis.get(scopeKeys.reference(payload.scopeRef));
  // Referans düşmüşse kapsam bilinmiyor demektir; "sınırsız" değil, bayat sayılır.
  if (raw === null) throw new ScopeStaleError();
  return JSON.parse(raw) as ScopeMap;
}

/** `access_token` çerezini doğrular ve `req.user`'ı doldurur. */
export function requireAuth() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const token = req.cookies?.[AUTH_COOKIE_NAMES.ACCESS];

    if (typeof token !== 'string' || !token) {
      next(new UnauthenticatedError('Oturum çerezi eksik veya hatalı biçimde'));
      return;
    }

    let payload: ReturnType<typeof verifyAccessToken>;
    try {
      payload = verifyAccessToken(token);
    } catch {
      next(new UnauthenticatedError('Token geçersiz veya süresi dolmuş'));
      return;
    }

    resolveScopes(payload)
      .then((scopes) => {
        req.user = {
          id: payload.sub,
          email: payload.email,
          roles: payload.roles,
          permissions: payload.perms,
          scopes,
        };
        next();
      })
      .catch(next);
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
