/**
 * Kaskad kuralları — saf iş mantığı, I/O yoktur.
 *
 * İki kesinti arasındaki ilişki tek yönlüdür: **kapsayan** kesintinin etki kümesi
 * **kapsanan** kesintinin elemanını içerir. Kapsanan kesintinin müşteri-dakikası
 * ayrıca sayılmaz — aksi halde bir TM arızasında aynı abone hem TM hem trafo
 * kesintisinde sayılır ve raporlar iki katına çıkar.
 */

/** Kaskad zincirinin izlenebileceği en fazla adım — bozuk veride sonsuz döngüyü keser. */
export const MAX_CASCADE_DEPTH = 16;

export type OutageRelationType = 'CONTAINS' | 'SUPERSEDES';

/** Zincir taramasının ihtiyaç duyduğu asgari kesinti görünümü. */
export interface CascadeNode {
  id: string;
  parentOutageId: string | null;
}

export interface CycleCheckResult {
  /** Bağ kurulabilir mi. */
  allowed: boolean;
  /** Engellendiyse sebebi — log ve hata detayı için. */
  reason?: 'self_reference' | 'cycle' | 'max_depth';
}

/**
 * `childId`'yi `parentId`'ye bağlamanın zinciri döngüye sokup sokmadığını denetler.
 *
 * Döngü koruması iki katmanlıdır: olay zarfındaki `origin`/`depth` mekanizması olayların
 * sonsuz tetiklenmesini engeller, bu fonksiyon da `parentOutageId` zincirinin kendi üstüne
 * kapanmasını engeller. `nodesById` yalnız zincir üzerindeki kesintileri içermek zorundadır.
 */
export function canLinkParent(
  childId: string,
  parentId: string,
  nodesById: ReadonlyMap<string, CascadeNode>,
): CycleCheckResult {
  if (childId === parentId) return { allowed: false, reason: 'self_reference' };

  // Yeni ebeveynin kendi üst zincirinde çocuk görünüyorsa bağ döngü yaratır.
  let current: string | null = parentId;
  for (let depth = 0; current !== null; depth++) {
    if (depth >= MAX_CASCADE_DEPTH) return { allowed: false, reason: 'max_depth' };
    if (current === childId) return { allowed: false, reason: 'cycle' };

    const node: CascadeNode | undefined = nodesById.get(current);
    if (!node) break; // zincir bilinmeyen bir düğümde bitiyor — döngü yok
    current = node.parentOutageId;
  }

  return { allowed: true };
}

/**
 * Kapsanan (bir üst kesintiye bağlı) kesintinin müşteri-dakikası **sıfırdır**: etkilenen
 * aboneler zaten kapsayan kesintide sayılıyor. Kapsamayan kesintide değer
 * `etkilenen abone × süre`dir; süre henüz bitmemişse (`durationMinutes === null`) hesap
 * yapılamaz ve `null` döner.
 */
export function computeCustomerMinutes(
  affectedCustomerCount: number | null,
  durationMinutes: number | null,
  parentOutageId: string | null,
): number | null {
  if (parentOutageId !== null) return 0;
  if (affectedCustomerCount === null || durationMinutes === null) return null;
  return affectedCustomerCount * durationMinutes;
}
