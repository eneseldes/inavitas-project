import { z } from 'zod';

/** Varsayılan ve maksimum sayfa boyutu sınırları. */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

/** Ortak sayfalanmış veri yanıtı nesnesi. */
export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Veri kümesini sayfalanmış yanıt nesnesine dönüştürür. */
export function toPageResult<T>(items: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** `page` ve `pageSize` değerlerini SQL `LIMIT` / `OFFSET` parametrelerine dönüştürür. */
export function toLimitOffset(pagination: PaginationQuery): { limit: number; offset: number } {
  return { limit: pagination.pageSize, offset: (pagination.page - 1) * pagination.pageSize };
}

export interface SortOrder {
  field: string;
  dir: 'asc' | 'desc';
}

/**
 * `field:dir` formatındaki sıralama parametresini doğrular.
 * Geçersiz alanlarda varsayılan sıralama nesnesini (fallback) döner.
 */
export function parseSort(sort: string | undefined, allowed: readonly string[], fallback: SortOrder): SortOrder {
  if (!sort) return fallback;

  const [field, dir] = sort.split(':');

  if (!field || !allowed.includes(field)) return fallback;

  return { field, dir: dir === 'asc' ? 'asc' : 'desc' };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Yalnızca tarih içeren aralık filtrelerinin üst sınırını o günün sonuna kapsayacak şekilde bir sonraki güne yuvarlar.
 */
export function toExclusiveUpperBound(value: string): Date {
  const date = new Date(value);

  if (DATE_ONLY.test(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date;
}
