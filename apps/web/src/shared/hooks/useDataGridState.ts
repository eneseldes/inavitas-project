import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ColumnMeta, FilterValue } from '../components/DataGrid.tsx';
import type { SortDirection } from '../../types/api.ts';

export interface DataGridSort {
  field: string;
  dir: SortDirection;
}

interface UseDataGridStateOptions<T> {
  columns: ColumnDef<T>[];
  defaultSort: DataGridSort;
  defaultPageSize?: number;
}

function emptyFilterValue(type: NonNullable<ColumnMeta['filter']>['type']): FilterValue {
  switch (type) {
    case 'multiselect':
      return [];
    case 'date':
      return { operator: 'between', from: '', to: '' };
    case 'numberRange':
      return {};
    default:
      return '';
  }
}

/**
 * `DataGrid`'e bağlanan sayfa/sıralama/filtre state'ini ve sütun `meta.filter.toQuery`
 * eşlemelerinden türetilen backend query nesnesini tek yerde toplar.
 *
 * Başlangıç filtre değerleri sütun tanımlarından (meta.filter) otomatik çıkarılır —
 * yeni filtreli bir sütun eklemek için grid'de elle state eklemek gerekmez.
 */
export function useDataGridState<T>({ columns, defaultSort, defaultPageSize = 25 }: UseDataGridStateOptions<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sort, setSort] = useState<DataGridSort>(defaultSort);
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>(() => {
    const values: Record<string, FilterValue> = {};
    columns.forEach((column) => {
      const filterConfig = (column.meta as ColumnMeta | undefined)?.filter;
      if (!filterConfig) return;
      values[filterConfig.key] = emptyFilterValue(filterConfig.type);
    });
    return values;
  });

  const onFilterChange = (key: string, value: FilterValue) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const onSortChange = (next: DataGridSort) => {
    setSort(next);
    setPage(1);
  };

  const onPageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const queryFilters = useMemo(() => {
    const result: Record<string, unknown> = {};
    columns.forEach((column) => {
      const filterConfig = (column.meta as ColumnMeta | undefined)?.filter;
      if (!filterConfig) return;
      const value = filterValues[filterConfig.key];
      if (value === undefined) return;
      Object.assign(result, filterConfig.toQuery(value));
    });
    return result;
  }, [columns, filterValues]);

  return {
    page,
    pageSize,
    sort,
    filterValues,
    queryFilters,
    setPage,
    onPageChange: setPage,
    onPageSizeChange,
    onSortChange,
    onFilterChange,
  };
}
