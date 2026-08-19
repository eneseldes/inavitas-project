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
import { useAuth } from '../auth/useAuth.tsx';
import { apiFetch } from '../../shared/api/client.ts';
import type { Dictionary, Locale } from '../../types/translation.ts';
import { interpolate } from './interpolate.ts';

const STORAGE_KEY = 'i18n_locale';
const RECONNECT_DELAY_MS = 3_000;

export type TranslateFn = (key: string, params?: Record<string, string | number>, fallback?: string) => string;

interface I18nContextValue {
  t: TranslateFn;
  locale: string;
  locales: Locale[];
  changeLanguage: (locale: string) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(() => localStorage.getItem(STORAGE_KEY) ?? 'tr-TR');

  const { data: activeLocales = [] } = useQuery<Locale[]>({
    queryKey: ['i18n', 'locales'],
    queryFn: () =>
      apiFetch<Locale[]>('/api/translations/locales', {
        skipAuthRetry: true,
        redirectOnAuthFailure: false,
      }),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (activeLocales.length === 0) return;
    if (activeLocales.some((l) => l.code === locale)) return;
    // Depolanan dil pasifleştirilmiş/silinmiş olabilir — varsayılana dönülür,
    // aksi halde istemci geçersiz kodla istek atıp çevirisiz kalır.
    const fallback = activeLocales.find((l) => l.isDefault)?.code ?? activeLocales[0].code;
    localStorage.setItem(STORAGE_KEY, fallback);
    setLocale(fallback);
  }, [activeLocales, locale]);

  // `text-transform: uppercase` Türkçe küçük "i"yi yalnız kök `lang` "tr" olduğunda
  // noktalı "İ"ye çevirir (CSS'in yerel-farkında büyük harf kuralı) — `<html lang>`
  // sabit "en" kaldığı sürece "İş Emirleri" gibi başlıklar "IS EMIRLERI" görünürdü.
  useEffect(() => {
    document.documentElement.lang = locale.split('-')[0]!;
  }, [locale]);

  const { data: dictionary = {} } = useQuery<Dictionary>({
    queryKey: ['i18n', locale],
    // namespace verilmez — sunucu tüm namespace'leri tek düz sözlükte döner (bkz. E3).
    queryFn: () =>
      apiFetch<Dictionary>(`/api/translations/bundle?locale=${locale}`, {
        skipAuthRetry: true,
        redirectOnAuthFailure: false,
      }).catch(() => ({})),
    staleTime: Infinity,
  });

  const t = useCallback(
    (key: string, params?: Record<string, string | number>, fallback?: string) =>
      interpolate(dictionary[key] ?? fallback ?? key, params),
    [dictionary],
  );

  const changeLanguage = useCallback((next: string) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocale(next);
  }, []);

  const value = useMemo(
    () => ({ t, locale, locales: activeLocales, changeLanguage }),
    [t, locale, activeLocales, changeLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation, I18nProvider içinde kullanılmalı');
  return ctx;
}

/**
 * Canlı çeviri akışı AYRI bir bileşende yaşar ve AuthProvider'ın İÇİNDE monte edilir —
 * /api/translations/stream public değildir, oturumsuz 401 döner ve EventSource
 * sonsuz yeniden bağlanma döngüsüne girer (login ekranında dakikada 20 istek).
 */
export function TranslationStream() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

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
  }, [queryClient, user]);

  return null;
}
