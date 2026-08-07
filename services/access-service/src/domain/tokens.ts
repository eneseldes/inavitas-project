import type { AuthenticatedUser } from '@inavitas/shared';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';

/** Access token payload verisi. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  perms: string[];
}

/** Refresh token payload verisi (kullanıcı id ve benzersiz token id - jti). */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

const ACCESS_TYPE = 'access';
const REFRESH_TYPE = 'refresh';

/** Kullanıcı için yeni bir Access Token imzalar. */
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

/** Yeni bir Refresh Token imzalar. */
export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, jti, typ: REFRESH_TYPE }, config.JWT_SECRET, {
    expiresIn: config.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Access Token'ı doğrular ve payload nesnesini döner.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload & { typ?: string };

  if (decoded.typ !== ACCESS_TYPE) {
    throw new jwt.JsonWebTokenError('Beklenen token tipi: access');
  }

  return decoded;
}

/**
 * Refresh Token'ı doğrular ve payload nesnesini döner.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET) as RefreshTokenPayload & { typ?: string };

  if (decoded.typ !== REFRESH_TYPE) {
    throw new jwt.JsonWebTokenError('Beklenen token tipi: refresh');
  }

  return decoded;
}

/** Token payload verisini AuthenticatedUser nesnesine dönüştürür. */
export function toAuthenticatedUser(payload: AccessTokenPayload): AuthenticatedUser {
  return {
    id: payload.sub,
    email: payload.email,
    roles: payload.roles,
    permissions: payload.perms,
  };
}
