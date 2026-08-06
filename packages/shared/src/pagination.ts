import { z } from 'zod';

/**
 * Sunucu taraflı sayfalama — SRS FR-2.2/FR-3.2.
 *
 * outage-service ve work-order-service aynı zarfı (`items`, `page`,
 * `pageSize`, `total`, `totalPages`) döner ki frontend'de tek bir DataGrid
 * bileşeni yeterli olsun (02-MIMARI 2.9). `findMany()` + JS `slice()` YAPMA —
 * 100k kayıtta çöker; LIMIT/OFFSET her zaman veritabanında uygulanır.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toPageResult<T>(items: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** `page`/`pageSize`i SQL `LIMIT`/`OFFSET`e çevirir. */
export function toLimitOffset(pagination: PaginationQuery): { limit: number; offset: number } {
  return { limit: pagination.pageSize, offset: (pagination.page - 1) * pagination.pageSize };
}

export interface SortOrder {
  field: string;
  dir: 'asc' | 'desc';
}

/**
 * `sort=createdAt:desc` biçimindeki query param'ı doğrular.
 *
 * Bilinmeyen bir alan veya bozuk biçim sessizce fallback'e döner — 400
 * fırlatmak sıralama için fazla katı olur, kullanıcı sadece varsayılan
 * sırayı görür.
 */
export function parseSort(sort: string | undefined, allowed: readonly string[], fallback: SortOrder): SortOrder {
  if (!sort) return fallback;

  const [field, dir] = sort.split(':');

  if (!field || !allowed.includes(field)) return fallback;

  return { field, dir: dir === 'asc' ? 'asc' : 'desc' };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tarih aralığı filtresinin ÜST sınırını hesaplar (roadmap Faz 2 tuzağı).
 *
 * `startedAtTo=2026-01-31` gibi yalnızca tarih içeren bir değer, o günün
 * TAMAMINI kapsamalı: 31 Ocak'ın 23:59:59.999'una kadar. Bunu `<=` ile değil,
 * bir sonraki güne `<` ile karşılaştırarak yapıyoruz — TIMESTAMPTZ ve saat
 * dilimi farklarında `<=` gece yarısını kaçırabilir. Değer zaten tam bir
 * datetime ise (saat bilgisi taşıyorsa) olduğu gibi kullanılır.
 */
export function toExclusiveUpperBound(value: string): Date {
  const date = new Date(value);

  if (DATE_ONLY.test(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date;
}
