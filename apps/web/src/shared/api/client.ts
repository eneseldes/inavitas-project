import type { LoginResponse } from '../../types/auth.ts';
import { clearAuth, getAccessToken, getRefreshToken, saveTokens } from './auth-storage.ts';
import { ApiError, toApiError } from './errors.ts';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** login/refresh gibi public uçlar — 401 alınca refresh DENENMEZ (sonsuz döngü olur). */
  skipAuthRetry?: boolean;
}

function buildHeaders(options: RequestOptions): Headers {
  const headers = new Headers(options.headers);
  const token = getAccessToken();

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  return headers;
}

function rawFetch(path: string, options: RequestOptions): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: buildHeaders(options),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Eşzamanlı 401 hatalarında tek bir yenileme (refresh) isteği yapılmasını sağlar.
 * Yarış koşullarını (race condition) ve gereksiz belirteç iptallerini engeller.
 */
let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError(401, 'UNAUTHENTICATED', 'Oturum bulunamadı');

  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) throw await toApiError(res);

  const body = (await res.json()) as Pick<LoginResponse, 'accessToken' | 'refreshToken'>;
  saveTokens(body.accessToken, body.refreshToken);
}

/**
 * Merkezi API çağrı fonksiyonu.
 *
 * - Access token'ı Authorization header'ına ekler
 * - 401 alınca refresh dener, BİR KEZ isteği tekrarlar (sonsuz döngüye
 *   girmemek için skipAuthRetry olmadıkça yalnızca bir kez)
 * - Refresh de başarısız olursa oturumu temizler, /login'e yönlendirir
 * - Hata gövdesini ApiError'a normalize eder
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await rawFetch(path, options);

  if (res.status === 401 && !options.skipAuthRetry && getRefreshToken()) {
    try {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      await refreshPromise;
      res = await rawFetch(path, options);
    } catch {
      clearAuth();
      window.location.assign('/login');
      throw new ApiError(401, 'UNAUTHENTICATED', 'Oturum sona erdi, tekrar giriş yapın');
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}
