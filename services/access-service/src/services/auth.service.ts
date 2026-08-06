import {
  AppError,
  UnauthenticatedError,
  type AuthenticatedUser,
} from '@edas/shared';
import { randomUUID } from 'node:crypto';
import { isLocked, lockRemainingSeconds, registerFailure, resetLock } from '../domain/lockout.ts';
import { verifyPassword, wastePasswordCompareTime } from '../domain/password.ts';
import { refreshTokenStore } from '../domain/refresh-store.ts';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../domain/tokens.ts';
import * as userRepository from '../repository/user.repository.ts';
import type { UserWithAccess } from '../repository/user.repository.ts';

/**
 * Kimlik doğrulama iş mantığı.
 *
 * HTTP'yi bilmez — Express `Request`/`Response` buraya girmez. Controller
 * parse eder, buraya düz veri verir, dönen sonucu biçimlendirir.
 */

/** Giriş başarısız olduğunda dönen TEK mesaj. */
const INVALID_CREDENTIALS = 'E-posta veya parola hatalı';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

function toPublicUser(user: UserWithAccess): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles,
    permissions: user.permissions,
  };
}

function toAuthenticatedUser(user: UserWithAccess): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
  };
}

/** Refresh token üretip kaydeder. Süreyi JWT'nin kendi `exp`inden okuruz. */
async function issueRefreshToken(userId: string): Promise<string> {
  const jti = randomUUID();
  const token = signRefreshToken(userId, jti);

  // Store'daki TTL ile JWT'nin exp'i aynı kaynaktan gelsin diye token'ı
  // çözüp exp'ini okuyoruz — iki yerde ayrı süre hesaplamak, birini
  // değiştirip diğerini unutmaya davetiye.
  const { exp } = verifyRefreshToken(token) as { exp?: number };
  const expiresAt = new Date((exp ?? 0) * 1000);

  await refreshTokenStore.save(jti, { userId, expiresAt });
  return token;
}

/**
 * E-posta + parola ile giriş (FR-1.1, FR-1.5).
 *
 * Üç ayrı başarısızlık — kullanıcı yok, parola yanlış, hesap pasif — istemciye
 * AYNI mesajla döner. Farklı mesaj vermek, saldırgana hangi e-postaların
 * kayıtlı olduğunu söyler (user enumeration).
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await userRepository.findByEmail(email);

  // Kullanıcı yoksa da bcrypt maliyetini öde — yoksa "yok" cevabı belirgin
  // şekilde daha hızlı döner ve zamanlama farkından e-posta varlığı sızar.
  if (!user) {
    await wastePasswordCompareTime(password);
    throw new UnauthenticatedError(INVALID_CREDENTIALS);
  }

  const now = new Date();

  // Kilit kontrolü parola kontrolünden ÖNCE: kilitliyken doğru parola bile
  // giriş yaptırmamalı, yoksa kilit brute-force'u yavaşlatmaz.
  if (isLocked(user, now)) {
    throw new AppError(
      'RATE_LIMITED',
      `Hesap geçici olarak kilitli. ${lockRemainingSeconds(user, now)} saniye sonra tekrar deneyin.`,
    );
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);

  if (!passwordOk) {
    await userRepository.updateLockState(user.id, registerFailure(user, now));
    throw new UnauthenticatedError(INVALID_CREDENTIALS);
  }

  // Pasif hesap: parola doğru olsa bile giremez. Sayaç artırmıyoruz —
  // parola doğruydu, bu bir saldırı denemesi değil.
  if (!user.isActive) {
    throw new UnauthenticatedError(INVALID_CREDENTIALS);
  }

  // Başarılı giriş sayacı sıfırlar: "ardışık" 5 hata kuralı bunu gerektirir.
  if (user.failedAttempts !== 0 || user.lockedUntil !== null) {
    await userRepository.updateLockState(user.id, resetLock());
  }

  return {
    accessToken: signAccessToken(toAuthenticatedUser(user)),
    refreshToken: await issueRefreshToken(user.id),
    user: toPublicUser(user),
  };
}

/**
 * Refresh token ile yeni token çifti (FR-1.3).
 *
 * Rotation: eski token KULLANILDIĞI ANDA iptal edilir. Böylece çalınan bir
 * refresh token en fazla bir kez işe yarar; ikinci kullanımda reddedilir.
 */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let payload: { sub: string; jti: string };

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    // İmza hatası, süre dolması, yanlış token tipi — hepsi aynı cevap.
    throw new UnauthenticatedError('Refresh token geçersiz veya süresi dolmuş');
  }

  const stored = await refreshTokenStore.get(payload.jti);

  // İmzası geçerli ama kayıtta yok: ya logout edilmiş, ya zaten bir kez
  // kullanılıp rotate edilmiş bir token. İkisi de reddedilir.
  if (!stored || stored.userId !== payload.sub) {
    throw new UnauthenticatedError('Refresh token geçersiz veya süresi dolmuş');
  }

  await refreshTokenStore.revoke(payload.jti);

  // Rolleri DB'den TAZE okuyoruz: kullanıcının yetkisi token verildikten
  // sonra değiştiyse, refresh anında güncel hali yansısın.
  const user = await userRepository.findById(payload.sub);

  if (!user || !user.isActive) {
    throw new UnauthenticatedError('Kullanıcı artık aktif değil');
  }

  return {
    accessToken: signAccessToken(toAuthenticatedUser(user)),
    refreshToken: await issueRefreshToken(user.id),
  };
}

/** Çıkış (FR-1.4). Geçersiz token'da da sessizce başarılı sayılır. */
export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await refreshTokenStore.revoke(payload.jti);
  } catch {
    // Zaten geçersiz bir token'ı iptal etmeye çalışmak hata değil —
    // istemcinin gördüğü sonuç aynı: artık o token çalışmıyor.
  }
}

/** `GET /auth/me` — roller DB'den taze okunur (FR-1.6). */
export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await userRepository.findById(userId);

  if (!user || !user.isActive) {
    throw new UnauthenticatedError('Kullanıcı bulunamadı veya aktif değil');
  }

  return toPublicUser(user);
}
