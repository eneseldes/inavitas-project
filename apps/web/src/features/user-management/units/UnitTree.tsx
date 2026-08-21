import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { UnitNode } from '../../../types/user-management.ts';
import { useExpandedUnitChildren, useUnitChildren, useUnitSearch } from './useUnits.ts';

/** Bir satırın çizilmesi için gereken her şey — görünümü çağıran belirler. */
export interface UnitTreeRow {
  unit: UnitNode;
  /** Girinti seviyesi; kökler 0. */
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  toggle: () => void;
}

interface UnitTreeProps {
  /** Doluysa ağaç değil arama sonucu çizilir; eşleşmeler atalarıyla birlikte açık gelir. */
  search?: string;
  /** Satır görünümü — Birimler sekmesi tablo satırı, seçici ise düğme çizer. */
  children: (row: UnitTreeRow) => ReactNode;
  /** Yükleniyor / boş sonuç durumlarında gösterilecek içerik. */
  fallback?: (state: { isLoading: boolean; isEmpty: boolean }) => ReactNode;
}

/** Bir yolun kendisi hariç tüm ata yolları: `TR.06.012.0137` → `TR.06`, `TR.06.012`. */
function ancestorPaths(path: string): string[] {
  const segments = path.split('.');
  return segments.slice(0, -1).map((_, idx) => segments.slice(0, idx + 1).join('.'));
}

/**
 * İdari birim ağacı — tembel yüklemeli, aranabilir, seviyeye göre girintili.
 *
 * Hem Birimler sekmesi hem kullanıcı modalindeki birim seçici bunu kullanır; iki ayrı ağaç
 * implementasyonu yazılmaz. Satırın görünümü çağırana bırakılır, ağacın davranışı burada
 * tektir.
 */
export function UnitTree({ search, children, fallback }: UnitTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const term = search?.trim() ?? '';
  const isSearching = term.length > 0;

  const roots = useUnitChildren(undefined);
  const searchResult = useUnitSearch(term);

  // Kapalı düğümlerin çocukları hiç istenmez; açılan her düğüm için ayrı bir sorgu açılır.
  const expandedPaths = useMemo(() => [...expanded].sort(), [expanded]);
  const childResults = useExpandedUnitChildren(isSearching ? [] : expandedPaths);

  /**
   * Ebeveyn yoluna göre gruplanmış düğümler. Arama modunda tek yanıt hem eşleşmeleri hem
   * atalarını taşır; ağaç modunda kökler ve açılmış düğümlerin çocukları birleştirilir.
   */
  const byParent = useMemo(() => {
    const nodes = isSearching
      ? (searchResult.data?.items ?? [])
      : [...(roots.data?.items ?? []), ...childResults.flatMap((r) => r.data?.items ?? [])];

    const map = new Map<string, UnitNode[]>();
    for (const node of nodes) {
      const key = node.parentPath ?? '';
      const list = map.get(key);
      if (list) list.push(node);
      else map.set(key, [node]);
    }
    return map;
  }, [isSearching, searchResult.data, roots.data, childResults]);

  // Arama sonucunda eşleşen düğüm atalarıyla birlikte açık gelmeli; ağaç modunda kullanıcının
  // kendi açtıkları geçerlidir.
  const openPaths = useMemo(() => {
    if (!isSearching) return expanded;
    const paths = new Set<string>();
    for (const node of searchResult.data?.items ?? []) {
      for (const ancestor of ancestorPaths(node.path)) paths.add(ancestor);
    }
    return paths;
  }, [isSearching, searchResult.data, expanded]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderLevel = (parentKey: string, depth: number): ReactNode[] =>
    (byParent.get(parentKey) ?? []).flatMap((unit) => {
      const isExpanded = openPaths.has(unit.path);
      const rows: ReactNode[] = [
        // Anahtar burada verilir: satırın görünümünü çağıran çiziyor ama ağaçtaki kimliği
        // yolun kendisi belirliyor.
        <Fragment key={unit.path}>
          {children({
            unit,
            depth,
            isExpanded,
            hasChildren: unit.childCount > 0,
            toggle: () => toggle(unit.path),
          })}
        </Fragment>,
      ];
      if (isExpanded) rows.push(...renderLevel(unit.path, depth + 1));
      return rows;
    });

  // Arama sonucunda eşleşme bir ilçeyse ebeveyni (il) yanıtta vardır; ama eşleşme ilin
  // kendisiyse kökten başlanır. Yanıtta ebeveyni bulunmayan her düğüm kök gibi çizilir.
  const rootKeys = useMemo(() => {
    if (!isSearching) return [''];
    const known = new Set((searchResult.data?.items ?? []).map((n) => n.path));
    const orphanParents = [...byParent.keys()].filter((key) => key !== '' && !known.has(key));
    return ['', ...orphanParents];
  }, [isSearching, searchResult.data, byParent]);

  const rows = rootKeys.flatMap((key) => renderLevel(key, 0));

  if (rows.length === 0 && fallback) {
    const isLoading = isSearching ? searchResult.isLoading : roots.isLoading;
    return <>{fallback({ isLoading, isEmpty: !isLoading })}</>;
  }

  return <>{rows}</>;
}
