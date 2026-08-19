import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiChevronUp,
  FiFilter,
  FiInbox,
  FiRefreshCw,
  FiX,
} from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../../features/i18n/I18nProvider.tsx';
import type { SortDirection } from '../../types/api.ts';
import { ColumnFilter, type DateFilterValue, type FilterOption, type NumberRangeFilterValue } from './ColumnFilter.tsx';
import styles from './DataGrid.module.scss';

/** Sıralanabilir/filtrelenebilir kolonlar bu meta şekliyle tanımlanır. */
export interface ColumnFilterConfig {
  /** `filterValues` sözlüğündeki anahtar ve `onFilterChange`'e iletilen alan adı. */
  key: string;
  type: 'text' | 'select' | 'multiselect' | 'date' | 'numberRange';
  options?: FilterOption[];
  placeholder?: string;
  /** Filtre değerini backend query parçalarına çevirir (bir alan birden fazla query param'a açılabilir, ör. tarih aralığı). */
  toQuery: (value: FilterValue) => Record<string, unknown>;
}

export interface ColumnMeta {
  sortField?: string;
  filter?: ColumnFilterConfig;
}

export type FilterValue = string | string[] | DateFilterValue | NumberRangeFilterValue;

export interface DataGridProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Sıralama desteklemeyen tablolarda (ör. sabit listeler) atlanabilir. */
  sort?: { field: string; dir: SortDirection };
  onSortChange?: (sort: { field: string; dir: SortDirection }) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRefresh: () => void;
  /** Sütun filtre ikonlarının o an uyguladığı değerler — filtre anahtarına göre. */
  filterValues: Record<string, FilterValue>;
  onFilterChange: (key: string, value: FilterValue) => void;
  isFetching?: boolean;
  isLoading?: boolean;
  toolbarActions?: ReactNode;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  isRowSelected?: (item: T) => boolean;
  /** Araç çubuğunu (filtre/yenile) gizler — ör. sütun filtresi olmayan salt liste görünümleri. */
  hideToolbar?: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const POPOVER_WIDTH = 352;
const VIEWPORT_MARGIN = 8;

function headerLabel(header: unknown): string {
  return typeof header === 'string' ? header : '';
}

interface ActiveFilterItem {
  key: string;
  label: string;
  displayValue: string;
  emptyValue: FilterValue;
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
  isRowSelected,
  hideToolbar,
}: DataGridProps<T>) {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyMessage ?? t('common.table.empty');

  const [isFilterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterMenuPos, setFilterMenuPos] = useState({ top: 0, left: 0 });
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

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

  // Aktif filtrelerin özet listesini oluşturma
  const activeFilters: ActiveFilterItem[] = [];
  table.getHeaderGroups().forEach((headerGroup) => {
    headerGroup.headers.forEach((header) => {
      const meta = header.column.columnDef.meta as ColumnMeta | undefined;
      const filterConfig = meta?.filter;
      if (!filterConfig) return;

      const label = headerLabel(header.column.columnDef.header) || filterConfig.key;
      const val = filterValues[filterConfig.key];

      if (filterConfig.type === 'text') {
        const textVal = (val as string) ?? '';
        if (textVal.trim().length > 0) {
          activeFilters.push({ key: filterConfig.key, label, displayValue: textVal, emptyValue: '' });
        }
      } else if (filterConfig.type === 'select') {
        const selectVal = (val as string) ?? '';
        if (selectVal.length > 0) {
          const displayValue = filterConfig.options?.find((o) => o.value === selectVal)?.label ?? selectVal;
          activeFilters.push({ key: filterConfig.key, label, displayValue, emptyValue: '' });
        }
      } else if (filterConfig.type === 'multiselect') {
        const arrVal = (val as string[]) ?? [];
        if (arrVal.length > 0) {
          const displayLabels = arrVal.map((v) => filterConfig.options?.find((o) => o.value === v)?.label ?? v);
          activeFilters.push({ key: filterConfig.key, label, displayValue: displayLabels.join(', '), emptyValue: [] });
        }
      } else if (filterConfig.type === 'date') {
        const dateVal = val as DateFilterValue | undefined;
        if (dateVal?.from || dateVal?.to) {
          let displayValue = '';
          if (dateVal.operator === 'between' && dateVal.from && dateVal.to) {
            displayValue = `${dateVal.from} – ${dateVal.to}`;
          } else if (dateVal.operator === 'after' || (dateVal.from && !dateVal.to)) {
            displayValue = `>= ${dateVal.from}`;
          } else if (dateVal.operator === 'before' || (dateVal.to && !dateVal.from)) {
            displayValue = `<= ${dateVal.to}`;
          } else {
            displayValue = `${dateVal.from || ''} – ${dateVal.to || ''}`;
          }
          activeFilters.push({
            key: filterConfig.key,
            label,
            displayValue,
            emptyValue: { operator: 'between', from: '', to: '' },
          });
        }
      } else if (filterConfig.type === 'numberRange') {
        const rangeVal = val as NumberRangeFilterValue | undefined;
        if (rangeVal?.min !== undefined || rangeVal?.max !== undefined) {
          const displayValue =
            rangeVal.min !== undefined && rangeVal.max !== undefined
              ? `${rangeVal.min} – ${rangeVal.max}`
              : rangeVal.min !== undefined
                ? `>= ${rangeVal.min}`
                : `<= ${rangeVal.max}`;
          activeFilters.push({ key: filterConfig.key, label, displayValue, emptyValue: {} });
        }
      }
    });
  });

  const openFilterMenu = () => {
    const rect = filterBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFilterMenuPos({
      top: rect.bottom + 6,
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN)),
    });
    setFilterMenuOpen(true);
  };

  useEffect(() => {
    if (!isFilterMenuOpen) return;

    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (filterBtnRef.current?.contains(target) || filterPopoverRef.current?.contains(target)) return;
      setFilterMenuOpen(false);
    };
    const onScroll = () => setFilterMenuOpen(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterMenuOpen(false);
    };

    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isFilterMenuOpen]);

  return (
    <div className={styles.grid}>
      {!hideToolbar && (
        <div className={styles.toolbar}>
          <button
            ref={filterBtnRef}
            type="button"
            onClick={() => (isFilterMenuOpen ? setFilterMenuOpen(false) : openFilterMenu())}
            title={t('common.filter.activeTitle', undefined, 'Aktif Filtreler')}
            className={clsx('icon-btn', styles.filterMenuBtn, activeFilters.length > 0 && styles.filterMenuBtnActive)}
          >
            <FiFilter />
            {activeFilters.length > 0 && <span className={styles.badge}>{activeFilters.length}</span>}
          </button>

          <button type="button" onClick={onRefresh} title={t('common.action.refresh')} className="icon-btn">
            <FiRefreshCw className={clsx(isFetching && 'spin')} />
          </button>
          {toolbarActions}
        </div>
      )}

      {isFilterMenuOpen &&
        createPortal(
          <div
            ref={filterPopoverRef}
            className={styles.activeFiltersPopover}
            style={{ top: filterMenuPos.top, left: filterMenuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.popoverHeader}>
              <span>{t('common.filter.activeTitle', undefined, 'Aktif Filtreler')}</span>
              {activeFilters.length > 0 && (
                <span className="text-muted font-mono" style={{ fontSize: '0.75rem' }}>
                  ({activeFilters.length})
                </span>
              )}
            </div>

            {activeFilters.length === 0 ? (
              <div className={styles.emptyFilterState}>{t('common.filter.noActive', undefined, 'Aktif filtre bulunmuyor')}</div>
            ) : (
              <>
                <ul className={styles.activeFilterList}>
                  {activeFilters.map((item) => (
                    <li key={item.key} className={styles.activeFilterItem}>
                      <div className={styles.activeFilterText}>
                        <span className={styles.activeFilterLabel}>{item.label}:</span>
                        <span className={styles.activeFilterValue}>{item.displayValue}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onFilterChange(item.key, item.emptyValue)}
                        className={styles.removeFilterBtn}
                        title={t('common.filter.clear', undefined, 'Filtreyi temizle')}
                      >
                        <FiX />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={clsx('btn btn--ghost', styles.clearAllBtn)}
                  onClick={() => {
                    activeFilters.forEach((item) => onFilterChange(item.key, item.emptyValue));
                    setFilterMenuOpen(false);
                  }}
                >
                  {t('common.filter.clearAll', undefined, 'Tümünü Temizle')}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}

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
                    const isSortable = Boolean(sortField && onSortChange);
                    const isSorted = isSortable && sortField === sort?.field;
                    const label = headerLabel(header.column.columnDef.header);

                    const triggerSort = () => {
                      if (!isSortable || !sortField) return;
                      onSortChange!({ field: sortField, dir: isSorted && sort?.dir === 'asc' ? 'desc' : 'asc' });
                    };

                    return (
                      <th
                        key={header.id}
                        className={clsx(isSortable && styles.sortableHeader)}
                        onClick={isSortable ? triggerSort : undefined}
                        onKeyDown={
                          isSortable
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  triggerSort();
                                }
                              }
                            : undefined
                        }
                        tabIndex={isSortable ? 0 : undefined}
                        role={isSortable ? 'button' : undefined}
                        aria-sort={isSortable ? (isSorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                      >
                        <div className={styles.thContent}>
                          <span className={styles.thLabel}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {isSortable && (
                              <span className={clsx(styles.sortIcon, isSorted && styles.sortIconActive)}>
                                {sort?.dir === 'asc' ? <FiChevronUp /> : <FiChevronDown />}
                              </span>
                            )}
                          </span>

                          {filterConfig &&
                            (filterConfig.type === 'text' ? (
                              <ColumnFilter
                                type="text"
                                label={label}
                                value={(filterValues[filterConfig.key] as string) ?? ''}
                                onApply={(value) => onFilterChange(filterConfig.key, value)}
                                placeholder={filterConfig.placeholder}
                              />
                            ) : filterConfig.type === 'select' ? (
                              <ColumnFilter
                                type="select"
                                label={label}
                                value={(filterValues[filterConfig.key] as string) ?? ''}
                                onApply={(value) => onFilterChange(filterConfig.key, value)}
                                options={filterConfig.options ?? []}
                              />
                            ) : filterConfig.type === 'multiselect' ? (
                              <ColumnFilter
                                type="multiselect"
                                label={label}
                                value={(filterValues[filterConfig.key] as string[]) ?? []}
                                onApply={(value) => onFilterChange(filterConfig.key, value)}
                                options={filterConfig.options ?? []}
                              />
                            ) : filterConfig.type === 'numberRange' ? (
                              <ColumnFilter
                                type="numberRange"
                                label={label}
                                value={(filterValues[filterConfig.key] as NumberRangeFilterValue) ?? {}}
                                onApply={(value) => onFilterChange(filterConfig.key, value)}
                              />
                            ) : (
                              <ColumnFilter
                                type="date"
                                label={label}
                                value={(filterValues[filterConfig.key] as DateFilterValue) ?? { operator: 'between' }}
                                onApply={(value) => onFilterChange(filterConfig.key, value)}
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
                    className={clsx(onRowClick && 'clickable-row', isRowSelected?.(row.original) && 'selected-row')}
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
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="select select--compact">
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
