/**
 * Vurgu kümesi (highlight set) kaydı.
 *
 * Haritada "boyanacak" her şey — iz (up/down), enerjisiz küme, açık kesiciler, alan sorgusu
 * sonucu — artık **tek** bir kavramdan geçer: bir kimlik listesi + rol eşlemesi. Liste
 * istemciye hiç gitmez; Redis'e yazılır ve karşılığında bir **token** döner. İstemci yalnız
 * token'ı taşır ve `/network/tiles/set/:token/{z}/{x}/{y}.mvt` ucundan kendi penceresine
 * düşen parçayı çeker.
 *
 * Neden böyle: eski yolda vurgu ayrı bir geometri değil, ana tile'daki geometrinin
 * `setFeatureState` ile boyanmasıydı. Ana tile zoom'a göre eleman **atıyor**
 * (bkz. tiles/zoom-lod.ts `TYPE_MIN_ZOOM`) ve `BUS`/`FEEDER`/`LV_BUS` gibi tipleri hiç
 * göndermiyor; boyanacak geometri yoksa `setFeatureState` sessizce boşa gidiyordu. Kümenin
 * kendi tile'ı LOD uygulamaz — bu yüzden "downstream'de eleman gözükmüyor" burada biter.
 */

import { scopeSignature, PERMISSIONS, type AuthenticatedUser } from '@inavitas/shared';
import crypto from 'node:crypto';
import { redis } from '../../redis.ts';

/**
 * Vurgu rolleri. Renk ve kalınlık istemcide **yalnız** bu değerden sürülür
 * (bkz. apps/web/src/features/map/highlightLayers.ts).
 */
export const HIGHLIGHT_ROLES = ['up', 'down', 'dead', 'open', 'area'] as const;
export type HighlightRole = (typeof HIGHLIGHT_ROLES)[number];

/**
 * Bir kümede taşınabilecek en fazla kimlik.
 *
 * Değer veri setinin tamamından (593 bin eleman) büyüktür: **pratikte sınır yoktur**, bir
 * HV hattının downstream'i bütün şebekeyi kapsasa bile küme kırpılmaz. Eskiden 50 bindi ve
 * birkaç TM'i birden besleyen bir izde sessizce kesiliyordu.
 *
 * Sıfır yapmak yerine bir tavan bırakılmasının sebebi güvenlik: bozuk bir çağrı sonsuz bir
 * listeyle Redis'i doldurmasın. Tavana dayanılırsa `truncated` yukarı taşınır — sessiz
 * kayıp olmaz.
 *
 * ⚠️ Büyük kümenin maliyeti tile sorgusunda **kimlik başına** değil, **rol başına** ödenir:
 * kimlikler Postgres'e virgüllü tek bir metin olarak gider ve orada `string_to_table` ile
 * açılır (bkz. tile.ts). Node ne 600 bin string ayırır ne de dizi literali kaçışlar.
 */
export const HIGHLIGHT_SET_ID_LIMIT = 750_000;

/** Kümenin Redis'te yaşama süresi; her okumada tazelenir. */
const SET_TTL_SECONDS = 15 * 60;

/** Rol öncelik sırası: aynı eleman iki role birden düşerse soldaki kazanır. */
const ROLE_PRIORITY: readonly HighlightRole[] = ['open', 'up', 'down', 'dead', 'area'];

export interface HighlightSetInput {
  role: HighlightRole;
  ids: readonly string[];
}

/** Bir rolün kimlikleri — **açılmamış**, virgülle ayrılmış tek metin (bkz. `HighlightSet`). */
export interface HighlightGroup {
  role: HighlightRole;
  /** Virgüllü kimlik listesi; Postgres'te `string_to_table` ile satırlara açılır. */
  joinedIds: string;
}

export interface HighlightSet {
  /** Kümeyi üreten kullanıcının kapsam özeti — başka kapsamdaki kullanıcı token'ı kullanamaz. */
  scopeHash: string;
  /**
   * Rol başına virgüllü kimlik metni. Kimlikler burada **bilerek ayrıştırılmaz**: her tile
   * isteğinde 600 bin string ayırmak Node tarafında saniyeler süren bir GC yüküydü ve
   * Postgres'e dizi literali olarak yazılırken bir kez daha kaçışlanıyordu. Tek metin
   * gider, açma işini Postgres yapar.
   */
  groups: HighlightGroup[];
  truncated: boolean;
}

/** Kapsamın kısa özeti — tile önbelleği ve token'ı kapsamdan türetmek için (bkz. tiles.controller.ts). */
export function scopeHashOf(user: AuthenticatedUser): string {
  return crypto
    .createHash('sha1')
    .update(scopeSignature(user, PERMISSIONS.NETWORK_READ))
    .digest('hex')
    .slice(0, 12);
}

function keyOf(token: string): string {
  return `network:hlset:${token}`;
}

/**
 * Kümeyi kaydeder ve token'ını döner.
 *
 * Token kümenin **içeriğinden** türer (rastgele değil): aynı iz iki kez açıldığında aynı
 * token çıkar, dolayısıyla tarayıcı ve Redis'teki tile'lar yeniden kullanılır. Kapsam özeti
 * de karışıma girer — aynı iz farklı kapsamdaki iki kullanıcıda farklı token alır ve
 * tile'ları karışmaz.
 */
export async function registerHighlightSet(
  user: AuthenticatedUser,
  inputs: readonly HighlightSetInput[],
): Promise<{ token: string; truncated: boolean } | null> {
  const scopeHash = scopeHashOf(user);

  // Rol çakışmaları burada çözülür; tile sorgusuna her kimlik **tek** rolle gider.
  const byId = new Map<string, HighlightRole>();
  for (const role of ROLE_PRIORITY) {
    for (const input of inputs) {
      if (input.role !== role) continue;
      for (const id of input.ids) if (!byId.has(id)) byId.set(id, role);
    }
  }

  if (byId.size === 0) return null;

  const truncated = byId.size > HIGHLIGHT_SET_ID_LIMIT;
  const grouped = new Map<HighlightRole, string[]>();
  let taken = 0;
  for (const [id, role] of byId) {
    if (taken >= HIGHLIGHT_SET_ID_LIMIT) break;
    let bucket = grouped.get(role);
    if (!bucket) grouped.set(role, (bucket = []));
    bucket.push(id);
    taken++;
  }

  // Depolama biçimi: rol → virgüllü kimlik metni. Kimlikler sayısal CBS kodları olduğundan
  // bu, dizi JSON'undan belirgin şekilde küçüktür (50 bin kimlik ≈ 350 KB yerine ≈ 300 KB).
  const payload: Record<string, string> = {};
  for (const [role, ids] of grouped) payload[role] = ids.join(',');

  const body = JSON.stringify({ s: scopeHash, t: truncated, g: payload });
  const token = crypto.createHash('sha1').update(body).digest('hex').slice(0, 20);

  await redis.set(keyOf(token), body, 'EX', SET_TTL_SECONDS);

  return { token, truncated };
}

/**
 * Kümeyi okur ve TTL'ini tazeler. Token süresi dolmuşsa `undefined` döner — tile ucu bunu
 * **410 Gone** olarak bildirir ve istemci kümeyi yeniden ister (bkz. useHighlightSet).
 */
export async function readHighlightSet(token: string): Promise<HighlightSet | undefined> {
  const raw = await redis.get(keyOf(token));
  if (!raw) return undefined;

  await redis.expire(keyOf(token), SET_TTL_SECONDS);

  const parsed = JSON.parse(raw) as { s: string; t: boolean; g: Record<string, string> };

  const groups: HighlightGroup[] = [];
  for (const [role, joinedIds] of Object.entries(parsed.g)) {
    if (!joinedIds) continue;
    groups.push({ role: role as HighlightRole, joinedIds });
  }

  return { scopeHash: parsed.s, groups, truncated: parsed.t };
}
