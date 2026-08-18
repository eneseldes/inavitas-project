import type { AuthenticatedUser } from '@inavitas/shared';
import type { SQL } from 'drizzle-orm';

/**
 * Kullanıcının bölgesel yetki kapsamını (`unit_path <@ ANY(scopes)`) sorguya ekler.
 *
 * Şimdilik passthrough'tur — hiçbir sınır uygulamaz. Kullanıcı rolüne bölgesel `unit_path`
 * kapsamı eklendiğinde bu fonksiyon doldurulacaktır. Her liste sorgusu bu fonksiyondan
 * geçmelidir; doğrudan repository çağrısı yapan bir yol kalırsa kapsam kontrolü eklendiğinde
 * unutulmuş bir açık doğar.
 */
export function scopeFilter(_user: AuthenticatedUser, _unitPathColumn: unknown): SQL | undefined {
  return undefined;
}
