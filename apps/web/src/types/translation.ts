export interface Locale {
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  providerCode?: string | null;
}

export interface ProviderLanguage {
  code: string;
  name: string;
}

export interface ProviderLanguages {
  source: ProviderLanguage[];
  target: ProviderLanguage[];
}

export interface TranslationNamespace {
  id: string;
  name: string;
  description?: string;
}

export interface TranslationValueRow {
  id: string;
  keyId: string;
  localeCode: string;
  draftValue: string;
  publishedValue?: string | null;
  updatedBy: string;
  updatedAt: string;
  version: number;
}

export interface TranslationKeyRow {
  id: string;
  namespaceId: string;
  keyName: string;
  description?: string;
  createdAt: string;
  translations: Record<string, TranslationValueRow>;
}

export type Dictionary = Record<string, string>;

export interface UpdateTranslationInput {
  id: string;
  draftValue: string;
  version: number;
}

export interface CreateKeyInput {
  namespace: string;
  keyName: string;
  description?: string;
  initialTranslations?: Record<string, string>;
}
