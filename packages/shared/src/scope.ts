import { sql, type SQL } from 'drizzle-orm';
import { scopesFor, type AuthenticatedUser, type Permission } from './auth.ts';

/**
 * Yol listesini TEK bir `ltree[]` parametresine bağlar.
 *
 * ⚠️ Düz `${paths}` KULLANILAMAZ: drizzle bir diziyi şablonda gördüğünde onu virgülle
 * ayrılmış ayrı parametrelere açar (`IN (...)` deseni için) ve `::ltree[]` cast'i tek
 * elemanlı listede ham metne düşüp "malformed array literal" ile patlar.
 */
function ltreeArray(paths: readonly string[]): SQL {
  return sql`${sql.param([...paths])}::ltree[]`;
}

/**
 * Kapsam kümesinin Redis anahtarları — access-service yazar, gateway okur. İki servis
 * arasındaki tek sözleşme olduğu için burada durur; iki yerde ayrı yazılırsa biri değişip
 * diğeri kalır ve gateway kapsamı hiç bulamaz (yani her isteği kapsamsız sanır).
 */
export const scopeKeys = {
  /** Token'a sığmayan kapsam kümesi (bkz. referans modu). */
  reference: (ref: string): string => `scope:ref:${ref}`,
  /** Kullanıcının güncel kapsam sürümü; bayat token kontrolü buradan yürür. */
  version: (userId: string): string => `scope:ver:${userId}`,
} as const;

/**
 * Kullanıcının bölgesel yetki kapsamını (`unit_path <@ ANY(scopes)`) sorguya ekler.
 *
 * **Tek yerdedir ve öyle kalmalı.** Kapsam süzmesi dört okuma yolundan birden geçer (liste
 * uçları, tile üretimi, `/outages/map`, `/work-orders/map`) ve üç serviste yaşar; her
 * serviste ayrı bir kopya tutulsaydı biri değişip diğeri kalır ve unutulan sorgu sessiz bir
 * güvenlik açığı olurdu. Servisler yalnız hangi kolonu geçireceklerini bilir.
 *
 * Dönen `undefined` "sınır yok" demektir ve YALNIZ kullanıcı ağacın kökünde yetkiliyken
 * oluşur — kapsamsız (izinsiz) kullanıcı için `false` döner, yani hiçbir satır.
 */
export function scopeFilter(
  user: AuthenticatedUser,
  unitPathColumn: SQL | unknown,
  permission: Permission,
): SQL | undefined {
  const scopes = scopesFor(user, permission);
  if (scopes.length === 0) return sql`false`;

  return sql`${unitPathColumn} <@ ANY(${ltreeArray(scopes)})`;
}

/**
 * Elemanın DEĞDİĞİ tüm birimler üzerinden süzer (`unit_paths`).
 *
 * Bir OG hattı üç mahalleye birden değebilir: birincil `unit_path` kapsam dışında olsa da
 * hat kullanıcının bölgesine giriyorsa okunabilmeli. Yazma yolları bunu KULLANMAZ — orada
 * karar birincil birim üzerinden verilir, aksi halde bir mahalle sorumlusu komşu ilçedeki
 * hattı kesebilirdi.
 */
export function scopeFilterAnyUnit(
  user: AuthenticatedUser,
  unitPathColumn: SQL | unknown,
  unitPathsColumn: SQL | unknown,
  permission: Permission,
): SQL | undefined {
  const scopes = scopesFor(user, permission);
  if (scopes.length === 0) return sql`false`;

  return sql`(${unitPathColumn} <@ ANY(${ltreeArray(scopes)})
    OR (${unitPathsColumn} IS NOT NULL AND ${unitPathsColumn} <@ ANY(${ltreeArray(scopes)})))`;
}

/**
 * İdari birim ağacını süzer: kapsamın **altındaki** birimlerin yanında **atalarını** da
 * geçirir.
 *
 * Yenimahalle sorumlusu Ankara'yı görmeli — yoksa ağaç köksüz kalır ve haritada il sınırı
 * hiç çizilmez. Ata bir birimin varlığı bir sızıntı değildir: idari sınır zaten kamuya
 * açık bir bilgidir, şebeke verisi değil.
 */
export function scopeFilterUnitTree(
  user: AuthenticatedUser,
  pathColumn: SQL | unknown,
  permission: Permission,
): SQL | undefined {
  const scopes = scopesFor(user, permission);
  if (scopes.length === 0) return sql`false`;

  return sql`(${pathColumn} <@ ANY(${ltreeArray(scopes)}) OR ${pathColumn} @> ANY(${ltreeArray(scopes)}))`;
}

/**
 * Kapsam kümesinin cache anahtarına giren kısa imzası.
 *
 * ⚠️ Tile cache'i kullanıcıdan bağımsız bir anahtarla tutulursa bir kullanıcının tile'ı
 * kapsam dışı başka bir kullanıcıya servis edilir. İmza kapsamın kendisinden türer, kullanıcı
 * kimliğinden değil: aynı kapsamdaki iki kullanıcı aynı tile'ı paylaşabilmeli.
 */
export function scopeSignature(user: AuthenticatedUser, permission: Permission): string {
  const scopes = scopesFor(user, permission);
  return scopes.length === 0 ? 'none' : [...scopes].sort().join('|');
}
