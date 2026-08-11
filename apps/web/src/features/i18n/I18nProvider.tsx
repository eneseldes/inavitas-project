import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '../../shared/api/client.ts';
import type { Dictionary } from '../../types/translation.ts';
import { interpolate } from './interpolate.ts';

const STORAGE_KEY = 'i18n_locale';
const RECONNECT_DELAY_MS = 3_000;
const NAMESPACES = ['common', 'outage', 'work-order'] as const;

interface I18nContextValue {
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  locale: string;
  changeLanguage: (locale: string) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState(() => localStorage.getItem(STORAGE_KEY) ?? 'tr-TR');

  const { data: dictionary = {} } = useQuery<Dictionary>({
    queryKey: ['i18n', locale],
    queryFn: async () => {
      const bundles = await Promise.all(
        NAMESPACES.map((ns) =>
          apiFetch<Dictionary>(`/api/translations/bundle?locale=${locale}&namespace=${ns}`, {
            skipAuthRetry: true,
            redirectOnAuthFailure: false,
          }).catch(() => ({})),
        ),
      );
      return Object.assign({}, ...bundles) as Dictionary;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      if (stopped) return;

      source = new EventSource('/api/translations/stream', { withCredentials: true });
      source.onmessage = () => void queryClient.invalidateQueries({ queryKey: ['i18n'] });
      source.onerror = () => {
        source?.close();
        retryTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [queryClient]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>, fallback?: string) =>
      interpolate(dictionary[key] ?? fallback ?? key, params),
    [dictionary],
  );

  const changeLanguage = useCallback((next: string) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocale(next);
  }, []);

  const value = useMemo(() => ({ t, locale, changeLanguage }), [t, locale, changeLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation, I18nProvider içinde kullanılmalı');
  return ctx;
}
