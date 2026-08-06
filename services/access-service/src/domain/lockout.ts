/**
 * Hesap kilitleme kuralları (FR-1.5): 5 ardışık başarısız denemede 15 dk kilit.
 *
 * Saf fonksiyonlar — Prisma'yı, Express'i, saati bilmez (şimdiki zaman
 * parametre olarak geçilir). Bu sayede testleri altyapısız ve deterministik.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LockState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

/** Hesap şu anda kilitli mi? */
export function isLocked(state: LockState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** Kilidin bitmesine kaç saniye kaldığı — istemciye "x sn sonra dene" demek için. */
export function lockRemainingSeconds(state: LockState, now: Date = new Date()): number {
  if (!isLocked(state, now)) return 0;
  return Math.ceil((state.lockedUntil!.getTime() - now.getTime()) / 1000);
}

/**
 * Başarısız denemeden sonraki yeni kilit durumu.
 *
 * Süresi dolmuş bir kilit varsa sayaç sıfırdan başlar: 15 dk önce 4 kez
 * yanlış girmiş bir kullanıcı, bugünkü ilk hatasında kilitlenmemeli.
 */
export function registerFailure(state: LockState, now: Date = new Date()): LockState {
  const expiredLock = state.lockedUntil !== null && state.lockedUntil.getTime() <= now.getTime();
  const attempts = (expiredLock ? 0 : state.failedAttempts) + 1;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return { failedAttempts: attempts, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) };
  }

  return { failedAttempts: attempts, lockedUntil: null };
}

/** Başarılı girişten sonra: sayaç ve kilit temizlenir. */
export function resetLock(): LockState {
  return { failedAttempts: 0, lockedUntil: null };
}
