import { keepPreviousData, queryOptions, useQueries, useQuery } from '@tanstack/react-query';
import { fetchUnitTree } from '../api.ts';

export const UNITS_KEY = 'units';

/**
 * Bir seviyedeki birim sayısı — Ankara'nın 25 ilçesi ve bir ilçenin ~64 mahallesi tek
 * sayfaya sığar. Sunucudaki üst sınır 100'dür (MAX_PAGE_SIZE).
 */
const LEVEL_PAGE_SIZE = 100;

/**
 * Bir birimin doğrudan çocukları. `parent` yoksa ağacın kökleri gelir.
 *
 * Ağaç tembel yüklenir: 1.463 düğümü tek seferde göndermek hem yavaş hem gereksiz. Düğüm
 * bir kez açıldıktan sonra sonuç önbellekte kalır — idari birimler değişmeyen seed verisidir.
 */
export function unitChildrenOptions(parent: string | undefined) {
  return queryOptions({
    queryKey: [UNITS_KEY, 'tree', parent ?? null],
    queryFn: () => fetchUnitTree({ parent, pageSize: LEVEL_PAGE_SIZE }),
    staleTime: Infinity,
  });
}

export function useUnitChildren(parent: string | undefined) {
  return useQuery(unitChildrenOptions(parent));
}

/** Açılmış düğümlerin çocuklarını tek seferde çeker — sayısı çalışma anında değişir. */
export function useExpandedUnitChildren(paths: string[]) {
  return useQueries({ queries: paths.map((path) => unitChildrenOptions(path)) });
}

/** Ad araması — sunucu taraflıdır; eşleşmeler atalarıyla birlikte döner. */
export function useUnitSearch(term: string) {
  return useQuery({
    queryKey: [UNITS_KEY, 'search', term],
    queryFn: () => fetchUnitTree({ q: term, pageSize: LEVEL_PAGE_SIZE }),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
  });
}
