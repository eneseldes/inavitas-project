export type Dictionary = Record<string, string>;

/**
 * Varsayılan dil sözlüğü ile istenen dil sözlüğünü birleştirir (Sunucu tarafı fallback).
 * İstenen dilde eksik kalan anahtarlar varsayılan dildeki karşılığıyla tamamlanır.
 */
export function buildBundle(defaultMap: Dictionary, requestedMap: Dictionary): Dictionary {
  return { ...defaultMap, ...requestedMap };
}
