import type { ScopeMap } from '@inavitas/shared';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';

/** Access token payload verisi. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  perms: string[];
  /** Küçük kapsam kümesi token'ın içindedir; büyük olan Redis'te durur (`scopeRef`). */
  scopes?: ScopeMap;
  scopeRef?: string;
  scopeVersion?: number;
  typ?: string;
}

const ACCESS_TYPE = 'access';

/** Access token imzasını ve tipini doğrular. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload;

  if (decoded.typ !== ACCESS_TYPE) {
    throw new jwt.JsonWebTokenError('Beklenen token tipi: access');
  }

  return decoded;
}
