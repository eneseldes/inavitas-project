import type { AuthUser } from '../../types/auth.ts';

/**
 * Token saklama — 02-MIMARI 2.9'daki üç seçenekten üçüncüsü (bellek +
 * `httpOnly` cookie) production için önerilir, ama access-service login
 * uç noktası refreshToken'ı gövdede JSON olarak döner (cookie olarak değil)
 * — `httpOnly` cookie'ye geçmek backend'de Set-Cookie desteği ister.
 *
 * Staj demosu için burada BİLİNÇLİ BASİTLEŞTİRME yapılıyor: hem access hem
 * refresh token `localStorage`da tutuluyor. Bunun bedeli XSS'e açık olması;
 * gerçek üretimde refresh token'ı hiç JS'in görmediği `httpOnly` cookie'ye
 * taşımak gerekir.
 */
const STORAGE_KEY = 'inavitas.auth';

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

let cache: StoredAuth | null = readFromStorage();

function readFromStorage(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function getAuth(): StoredAuth | null {
  return cache;
}

export function saveAuth(auth: StoredAuth): void {
  cache = auth;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

/** Yalnızca token çiftini günceller (refresh sonrası) — kullanıcı bilgisi aynı kalır. */
export function saveTokens(accessToken: string, refreshToken: string): void {
  if (!cache) return;
  saveAuth({ ...cache, accessToken, refreshToken });
}

export function clearAuth(): void {
  cache = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function getAccessToken(): string | null {
  return cache?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return cache?.refreshToken ?? null;
}
