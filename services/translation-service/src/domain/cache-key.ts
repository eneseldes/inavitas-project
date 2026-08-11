/** `namespace` verilmeden istenen toplu bundle için sentinel değer (bkz. E3). */
export const ALL_NAMESPACES = '__all__';

/** Redis bundle önbellek anahtarını üretir: i18n:bundle:{locale}:{namespace}:v{version} */
export function buildBundleCacheKey(locale: string, namespace: string, version: number): string {
  return `i18n:bundle:${locale}:${namespace}:v${version}`;
}

/** Redis versiyon önbellek anahtarını üretir: i18n:ver:{locale}:{namespace} */
export function buildVersionCacheKey(locale: string, namespace: string): string {
  return `i18n:ver:${locale}:${namespace}`;
}

/** HTTP ETag değerini üretir: "{locale}:{namespace}:v{version}" */
export function buildEtag(locale: string, namespace: string, version: number): string {
  return `"${locale}:${namespace}:v${version}"`;
}
