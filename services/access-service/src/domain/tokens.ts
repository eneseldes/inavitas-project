import type { AuthenticatedUser } from '@edas/shared';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';

/**
 * JWT üretimi ve doğrulaması (FR-1.1, FR-1.3).
 *
 * Payload BİLEREK küçük: hassas veri (parola hash'i, telefon, adres) asla
 * girmez. JWT imzalıdır ama ŞİFRELİ DEĞİLDİR — içeriğini herkes okuyabilir.
 */

/** Access token'ın taşıdığı alanlar. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  perms: string[];
}

/** Refresh token yalnızca kimi temsil ettiğini ve kendi kimliğini taşır. */
export interface RefreshTokenPayload {
  sub: string;
  /** Token'ın kendi kimliği — rotation'da iptal etmek için gerekli. */
  jti: string;
}

/** İki token tipini imza doğrulandıktan SONRA da ayırt edebilmek için. */
const ACCESS_TYPE = 'access';
const REFRESH_TYPE = 'refresh';

export function signAccessToken(user: AuthenticatedUser): string {
  const payload: AccessTokenPayload & { typ: string } = {
    sub: user.id,
    email: user.email,
    roles: user.roles,
    perms: user.permissions,
    typ: ACCESS_TYPE,
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, jti, typ: REFRESH_TYPE }, config.JWT_SECRET, {
    expiresIn: config.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Access token'ı doğrular. İmza geçersiz veya süresi dolmuşsa fırlatır.
 *
 * `typ` kontrolü kritik: refresh token da aynı secret'la imzalı olduğu için
 * bu kontrol olmadan saldırgan refresh token'ı access token yerine kullanabilir.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload & { typ?: string };

  if (decoded.typ !== ACCESS_TYPE) {
    throw new jwt.JsonWebTokenError('Beklenen token tipi: access');
  }

  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET) as RefreshTokenPayload & { typ?: string };

  if (decoded.typ !== REFRESH_TYPE) {
    throw new jwt.JsonWebTokenError('Beklenen token tipi: refresh');
  }

  return decoded;
}

/** JWT payload'ından uygulama içi kimlik nesnesine. */
export function toAuthenticatedUser(payload: AccessTokenPayload): AuthenticatedUser {
  return {
    id: payload.sub,
    email: payload.email,
    roles: payload.roles,
    permissions: payload.perms,
  };
}
