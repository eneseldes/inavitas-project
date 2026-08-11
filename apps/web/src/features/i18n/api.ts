import { apiFetch } from '../../shared/api/client.ts';
import type {
  CreateKeyInput,
  Locale,
  TranslationKeyRow,
  TranslationNamespace,
  TranslationValueRow,
  UpdateTranslationInput,
} from '../../types/translation.ts';

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function fetchLocales(): Promise<Locale[]> {
  return apiFetch<Locale[]>('/api/translations/locales', {
    skipAuthRetry: true,
    redirectOnAuthFailure: false,
  });
}

export async function fetchNamespaces(): Promise<TranslationNamespace[]> {
  return apiFetch<TranslationNamespace[]>('/api/translations/namespaces');
}

export async function fetchTranslationKeys(params: {
  namespace?: string;
  page?: number;
  pageSize?: number;
  q?: string;
  onlyMissing?: boolean;
}): Promise<PageResult<TranslationKeyRow>> {
  const query = new URLSearchParams();
  if (params.namespace) query.set('namespace', params.namespace);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.q) query.set('q', params.q);
  if (params.onlyMissing) query.set('onlyMissing', 'true');

  return apiFetch<PageResult<TranslationKeyRow>>(`/api/translations/keys?${query.toString()}`);
}

export async function createTranslationKey(input: CreateKeyInput): Promise<TranslationKeyRow> {
  return apiFetch<TranslationKeyRow>('/api/translations/keys', {
    method: 'POST',
    body: input,
  });
}

export async function updateTranslation(input: UpdateTranslationInput): Promise<TranslationValueRow> {
  return apiFetch<TranslationValueRow>(`/api/translations/keys/${input.id}/translations`, {
    method: 'PUT',
    body: {
      draftValue: input.draftValue,
      version: input.version,
    },
  });
}

export async function publishTranslations(input?: { namespace?: string }): Promise<{ publishedCount: number }> {
  return apiFetch<{ publishedCount: number }>('/api/translations/publish', {
    method: 'POST',
    body: input ?? {},
  });
}

export async function createLocale(input: { code: string; name: string; isDefault?: boolean }): Promise<Locale> {
  return apiFetch<Locale>('/api/translations/locales', {
    method: 'POST',
    body: input,
  });
}

export async function updateLocaleActive(code: string, isActive: boolean): Promise<Locale> {
  return apiFetch<Locale>(`/api/translations/locales/${code}`, {
    method: 'PATCH',
    body: { isActive },
  });
}

export async function deleteTranslationKey(id: string): Promise<void> {
  await apiFetch<void>(`/api/translations/keys/${id}`, { method: 'DELETE' });
}

export interface AutoTranslateInput {
  targetLocale: string;
  sourceLocale?: string;
  namespace?: string;
  keyIds?: string[];
  onlyMissing?: boolean;
}

export async function autoTranslateKeys(input: AutoTranslateInput): Promise<{ translatedCount: number }> {
  return apiFetch<{ translatedCount: number }>('/api/translations/auto-translate', {
    method: 'POST',
    body: input,
  });
}
