import {
  AppError,
  UnauthenticatedError,
  type AuthenticatedUser,
  type ScopeMap,
} from '@inavitas/shared';
import { randomUUID } from 'node:crypto';
import { isLocked, lockRemainingSeconds, registerFailure, resetLock } from '../domain/lockout.ts';
import { verifyPassword, wastePasswordCompareTime } from '../domain/password.ts';
import { refreshTokenStore } from '../domain/refresh-store.ts';
import { publishScopeVersion, SCOPE_INLINE_LIMIT, scopeSize, storeScopes } from '../domain/scope-store.ts';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type ScopeClaim,
} from '../domain/tokens.ts';
import * as userRepository from '../repository/user.repository.ts';
import type { AssignmentRow, UserWithAccess } from '../repository/user.repository.ts';

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
  /** Etkin (izin, bölge) kümesi — arayüz "nerede yetkiliyim" sorusunu bundan cevaplar. */
  scopes: ScopeMap;
  assignments: AssignmentRow[];
}

function toPublicUser(user: UserWithAccess): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles,
    permissions: user.permissions,
    scopes: user.scopes,
    assignments: user.assignments,
  };
}

function toAuthenticatedUser(user: UserWithAccess): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
    scopes: user.scopes,
  };
}

/**
 * Kapsam kümesini token'a hazırlar ve güncel sürümü gateway'in okuyabileceği yere yayınlar.
 *
 * Küme eşiği aşarsa token'a gömülmez (bkz. SCOPE_INLINE_LIMIT): JWT bir çerezde taşınıyor,
 * onlarca mahalleye tek tek yetkilendirilmiş bir kullanıcı çerez sınırını zorlardı.
 */
async function issueScopeClaim(user: UserWithAccess): Promise<ScopeClaim> {
  await publishScopeVersion(user.id, user.scopeVersion);

  if (scopeSize(user.scopes) <= SCOPE_INLINE_LIMIT) return { scopes: user.scopes };
  return { scopeRef: await storeScopes(user.scopes) };
}

/** Kullanıcı için yeni bir Refresh Token oluşturur ve depoya kaydeder. */
async function issueRefreshToken(userId: string): Promise<string> {
  const jti = randomUUID();
  const token = signRefreshToken(userId, jti);

  const { exp } = verifyRefreshToken(token) as { exp?: number };
  const expiresAt = new Date((exp ?? 0) * 1000);

  await refreshTokenStore.save(jti, { userId, expiresAt });
  return token;
}

/**
 * E-posta ve parola doğrulayarak giriş yapar.
 * Başarısız denemelerde kilit mekanizmasını çalıştırır.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    await wastePasswordCompareTime(password);
    throw new UnauthenticatedError(INVALID_CREDENTIALS);
  }

  const now = new Date();

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

  if (!user.isActive) {
    throw new UnauthenticatedError(INVALID_CREDENTIALS);
  }

  if (user.failedAttempts !== 0 || user.lockedUntil !== null) {
    await userRepository.updateLockState(user.id, resetLock());
  }

  await userRepository.touchLastLogin(user.id, now);

  return {
    accessToken: signAccessToken(toAuthenticatedUser(user), await issueScopeClaim(user), user.scopeVersion),
    refreshToken: await issueRefreshToken(user.id),
    user: toPublicUser(user),
  };
}

/**
 * Geçerli bir Refresh Token ile yeni bir Access ve Refresh Token çifti üretir (rotation).
 */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let payload: { sub: string; jti: string };

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthenticatedError('Refresh token geçersiz veya süresi dolmuş');
  }

  const stored = await refreshTokenStore.get(payload.jti);

  if (!stored || stored.userId !== payload.sub) {
    throw new UnauthenticatedError('Refresh token geçersiz veya süresi dolmuş');
  }

  await refreshTokenStore.revoke(payload.jti);

  const user = await userRepository.findById(payload.sub);

  if (!user || !user.isActive) {
    throw new UnauthenticatedError('Kullanıcı artık aktif değil');
  }

  return {
    accessToken: signAccessToken(toAuthenticatedUser(user), await issueScopeClaim(user), user.scopeVersion),
    refreshToken: await issueRefreshToken(user.id),
  };
}

/**
 * Çıkış işlemi: İlgili Refresh Token'ı iptal eder.
 */
export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await refreshTokenStore.revoke(payload.jti);
  } catch {
    // İptal edilecek token zaten geçersizse işlem sessizce tamamlanır.
  }
}

/** Mevcut kullanıcının güncel bilgilerini veritabanından okur. */
export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await userRepository.findById(userId);

  if (!user || !user.isActive) {
    throw new UnauthenticatedError('Kullanıcı bulunamadı veya aktif değil');
  }

  return toPublicUser(user);
}
