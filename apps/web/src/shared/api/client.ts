import type { ApiErrorBody } from '../../types/api.ts';
import { getCsrfToken } from './csrf.ts';
import { ApiError, toApiError } from './errors.ts';

/** Boş: nginx/vite proxy sayesinde frontend ile API her zaman aynı origin. */
const API_URL = '';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** login/refresh gibi public uçlar — 401 alınca refresh DENENMEZ (sonsuz döngü olur). */
  skipAuthRetry?: boolean;
  /** false ise refresh de başarısız olunca /login'e yönlendirilmez (ör. oturum var mı diye sessizce bakan istekler). */
  redirectOnAuthFailure?: boolean;
}

function buildHeaders(options: RequestOptions): Headers {
  const headers = new Headers(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();

  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }

  return headers;
}

function rawFetch(path: string, options: RequestOptions): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: buildHeaders(options),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'include',
  });
}

/**
 * Kapsam bayatladığında (`SCOPE_STALE`) çalışan geri çağrı.
 *
 * Kapsam daralması bir "yeniden oturum" gibi ele alınır: token yenilenir ama önbellekte
 * duran eski kayıtlar kendiliğinden düşmez ve kullanıcı kapsam dışı kesintileri haritada
 * görmeye devam eder (SSE invalidate'i debounce'lu, harita kaynağı `setData` ile besleniyor).
 * Bağlanan taraf React Query önbelleğini tamamen boşaltır.
 */
type ScopeStaleListener = () => void;
let scopeStaleListener: ScopeStaleListener | undefined;

export function setScopeStaleListener(listener: ScopeStaleListener): void {
  scopeStaleListener = listener;
}

/** Eşzamanlı 401'lerde tek bir refresh isteği yapılmasını sağlar. */
let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: buildHeaders({ method: 'POST' }),
  });

  if (!res.ok) throw await toApiError(res);
}

/** 401 alınca bir kez refresh dener, olmazsa /login'e yönlendirir; hataları ApiError'a çevirir. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await rawFetch(path, options);

  if (res.status === 401 && !options.skipAuthRetry) {
    // Gövde burada okunur ama gerçek istek birazdan tekrarlanıyor; `clone()` olmadan
    // yanıt akışı tüketilmiş olurdu.
    const isScopeStale = await res
      .clone()
      .json()
      .then((body: unknown) => (body as ApiErrorBody | null)?.error?.code === 'SCOPE_STALE')
      .catch(() => false);

    try {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      await refreshPromise;
      if (isScopeStale) scopeStaleListener?.();
      res = await rawFetch(path, options);
    } catch {
      if (options.redirectOnAuthFailure !== false && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
      // React ağacının dışında — metin değil anahtar üretilir, gösteren taraf t() ile çevirir.
      throw new ApiError(401, 'UNAUTHENTICATED', 'auth.session.expired');
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}
