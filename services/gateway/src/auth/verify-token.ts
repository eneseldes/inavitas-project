import jwt from 'jsonwebtoken';
import { config } from '../config.ts';

/** access-service'in ürettiği payload ile birebir aynı şekil (bkz. access-service/src/domain/tokens.ts). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  perms: string[];
  typ?: string;
}

const ACCESS_TYPE = 'access';

/**
 * Access token'ı doğrular — access-service/src/domain/tokens.ts'teki
 * `verifyAccessToken` ile AYNI mantık, kasıtlı olarak burada tekrar
 * yazılıyor: gateway JWT doğrulamasını yapan TEK servis (ADR #5), bunun
 * için access-service'e çalışma zamanı bağımlılığı olmamalı.
 *
 * `typ` kontrolü kritik: refresh token da aynı secret'la imzalı, bu kontrol
 * olmadan biri refresh token'ı access token yerine geçirebilir.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload;

  if (decoded.typ !== ACCESS_TYPE) {
    throw new jwt.JsonWebTokenError('Beklenen token tipi: access');
  }

  return decoded;
}
