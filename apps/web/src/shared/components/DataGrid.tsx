import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import {
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiChevronUp,
  FiInbox,
  FiRefreshCw,
} from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../../features/i18n/I18nProvider.tsx';
import type { SortDirection } from '../../types/api.ts';
import { ColumnFilter, type FilterOption } from './ColumnFilter.tsx';
import styles from './DataGrid.module.scss';

/** Sıralanabilir/filtrelenebilir kolonlar bu meta şekliyle tanımlanır. */
export interface ColumnFilterConfig {
  /** Backend filtre query param adı (SORTABLE_FIELDS/filtre alanlarıyla eşleşir). */
  field: string;
  type: 'text' | 'multiselect';
  options?: FilterOption[];
  placeholder?: string;
}

export interface ColumnMeta {
  sortField?: string;
  filter?: ColumnFilterConfig;
}

export type FilterValue = string | string[];

export interface DataGridProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: { field: string; dir: SortDirection };
  onSortChange: (sort: { field: string; dir: SortDirection }) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRefresh: () => void;
  /** Sütun filtre ikonlarının o an uyguladığı değerler — alan adına göre. */
  filterValues: Record<string, FilterValue>;
  onFilterChange: (field: string, value: FilterValue) => void;
  isFetching?: boolean;
  isLoading?: boolean;
  toolbarActions?: ReactNode;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];


function headerLabel(header: unknown): string {
  return typeof header === 'string' ? header : '';
}

/**
 * Ortak tablo bileşeni. Kesinti ve iş emri listeleri için kullanılır.
 *
 * Sayfalama, sıralama ve filtreleme işlemleri sunucu taraflıdır (`manualPagination`/`manualSorting`).
 * Sütun başlıklarındaki filtreler uygulandıkça parametreler üst bileşene iletilir.
 */
export function DataGrid<T>({
  columns,
  data,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  filterValues,
  onFilterChange,
  isFetching,
  isLoading,
  toolbarActions,
  emptyMessage,
  onRowClick,
}: DataGridProps<T>) {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyMessage ?? t('common.table.empty');

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
  });

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={styles.grid}>
      <div className={styles.toolbar}>
        <button type="button" onClick={onRefresh} title={t('common.action.refresh')} className="icon-btn">
          <FiRefreshCw className={clsx(isFetching && 'spin')} />
        </button>
        {toolbarActions}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
        <table className="table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                  const sortField = meta?.sortField;
                  const filterConfig = meta?.filter;
                  const isSorted = sortField === sort.field;
                  const label = headerLabel(header.column.columnDef.header);

                  return (
                    <th key={header.id}>
                      <div className={styles.thContent}>
                        {sortField ? (
                          <button
                            type="button"
                            onClick={() => onSortChange({ field: sortField, dir: isSorted && sort.dir === 'asc' ? 'desc' : 'asc' })}
                            className={styles.sortTrigger}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {isSorted ? sort.dir === 'asc' ? <FiChevronUp className={styles.sortIcon} /> : <FiChevronDown className={styles.sortIcon} /> : null}
                          </button>
                        ) : (
                          <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        )}

                        {filterConfig &&
                          (filterConfig.type === 'text' ? (
                            <ColumnFilter
                              type="text"
                              label={label}
                              value={(filterValues[filterConfig.field] as string) ?? ''}
                              onApply={(value) => onFilterChange(filterConfig.field, value)}
                              placeholder={filterConfig.placeholder}
                            />
                          ) : (
                            <ColumnFilter
                              type="multiselect"
                              label={label}
                              value={(filterValues[filterConfig.field] as string[]) ?? []}
                              onApply={(value) => onFilterChange(filterConfig.field, value)}
                              options={filterConfig.options ?? []}
                            />
                          ))}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className={styles.loadingState}>
                  {t('common.loading')}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.emptyState}>
                  <div className={styles.emptyStateInner}>
                    <FiInbox className={styles.emptyIcon} />
                    <div>{resolvedEmptyMessage}</div>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={clsx(onRowClick && 'clickable-row')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))

            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.pageSizeGroup}>
          <span>{t('common.pagination.pageSize')}</span>
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className={clsx('select', styles.pageSizeSelect)}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <span>
          {from}–{to} / {total}
        </span>

        <div className={styles.pager}>
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(1)} className="icon-btn icon-btn--sm" title={t('common.pagination.first')}>
            <FiChevronsLeft />
          </button>
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="icon-btn icon-btn--sm" title={t('common.pagination.prev')}>
            <FiChevronLeft />
          </button>
          <span className={styles.pagerCurrent}>
            {page} / {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="icon-btn icon-btn--sm" title={t('common.pagination.next')}>
            <FiChevronRight />
          </button>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} className="icon-btn icon-btn--sm" title={t('common.pagination.last')}>
            <FiChevronsRight />
          </button>
        </div>
      </div>
    </div>
  );
}
