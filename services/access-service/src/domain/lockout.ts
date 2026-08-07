/**
 * Hesap kilitleme iş mantığı kuralları (ör. 5 ardışık başarısız denemede 15 dk kilit).
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LockState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

/** Hesabın belirtilen anda kilitli olup olmadığını kontrol eder. */
export function isLocked(state: LockState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** Hesap kilitliyse kilidin açılmasına kalan süreyi saniye cinsinden hesaplar. */
export function lockRemainingSeconds(state: LockState, now: Date = new Date()): number {
  if (!isLocked(state, now)) return 0;
  return Math.ceil((state.lockedUntil!.getTime() - now.getTime()) / 1000);
}

/**
 * Başarısız bir giriş denemesi sonrası yeni kilit durumunu günceller.
 */
export function registerFailure(state: LockState, now: Date = new Date()): LockState {
  const expiredLock = state.lockedUntil !== null && state.lockedUntil.getTime() <= now.getTime();
  const attempts = (expiredLock ? 0 : state.failedAttempts) + 1;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return { failedAttempts: attempts, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) };
  }

  return { failedAttempts: attempts, lockedUntil: null };
}

/** Başarılı giriş sonrası kilit sayacını sıfırlar. */
export function resetLock(): LockState {
  return { failedAttempts: 0, lockedUntil: null };
}
