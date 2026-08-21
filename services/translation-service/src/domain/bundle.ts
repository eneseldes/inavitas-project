export type Dictionary = Record<string, string>;

/**
 * Varsayılan dil sözlüğü ile istenen dil sözlüğünü birleştirir (sunucu tarafı fallback).
 *
 * Fallback'in ölçütü anahtarın **var olup olmaması**dır, değerinin dolu olması değil:
 * istenen dilde satırı olmayan anahtar varsayılan dilden tamamlanır, satırı olan anahtar
 * — değeri boş string bile olsa — olduğu gibi kullanılır.
 *
 * ⚠️ Boş string bir eksiklik DEĞİL, kasıtlı bir çeviridir: `auth.hero.titleAfter`
 * Türkçede "ile yönetin", İngilizcede boştur ("Manage your energy with **inavitas**").
 * Boşu eksik sayıp varsayılana düşmek, İngilizce ekrana Türkçe metin sızdırır.
 * "Hiç çevrilmedi" bilgisini taşıyan şey `published_value IS NULL`'dır ve o satır
 * repository'de zaten elenir (bkz. getPublishedBundleRows).
 */
export function buildBundle(defaultMap: Dictionary, requestedMap: Dictionary): Dictionary {
  return { ...defaultMap, ...requestedMap };
}
