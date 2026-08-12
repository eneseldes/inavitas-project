export type Dictionary = Record<string, string>;

/**
 * Varsayılan dil sözlüğü ile istenen dil sözlüğünü birleştirir (Sunucu tarafı fallback).
 * İstenen dilde eksik veya boş kalan anahtarlar varsayılan dildeki karşılığıyla tamamlanır.
 */
export function buildBundle(defaultMap: Dictionary, requestedMap: Dictionary): Dictionary {
  const result: Dictionary = { ...defaultMap };
  for (const [key, val] of Object.entries(requestedMap)) {
    if (val && val.trim() !== '') {
      result[key] = val;
    }
  }
  return result;
}
