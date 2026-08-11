/** Uygulama locale kodunu (tr-TR) sağlayıcı (DeepL) dil koduna çevirir. */
const PROVIDER_LOCALE_MAP: Record<string, string> = {
  'tr-TR': 'TR',
  'en-US': 'EN-US',
  'de-DE': 'DE',
};

/** Eşlenemeyen dil için `undefined` döner — çağıran taraf bunu `ValidationError`'a çevirir. */
export function toProviderLocale(locale: string): string | undefined {
  return PROVIDER_LOCALE_MAP[locale];
}
