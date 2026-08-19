import { useMemo, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { clsx } from 'clsx';
import type { ColumnDef } from '@tanstack/react-table';
import { DataGrid } from '../../shared/components/DataGrid.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { NetworkComponentAreaItem } from '../../types/network.ts';
import type { OutageMapItem } from '../../types/outage.ts';
import type { WorkOrderMapItem } from '../../types/work-order.ts';
import type { AreaQueryResult } from './api.ts';
import styles from './AreaResultPanel.module.scss';

/** Sonuçlar türüne göre ayrı sekmelerde listelenir; üç tabloyu yan yana koymak panele sığmaz. */
type ResultTab = 'components' | 'outages' | 'workOrders';

/** Kayıt sekmeleri istemci tarafında sayfalanır — veri zaten bellekte. */
const RECORD_PAGE_SIZE = 25;

interface AreaResultPanelProps {
  onClose: () => void;
  components: AreaQueryResult | undefined;
  isLoadingComponents: boolean;
  isFetchingComponents: boolean;
  onRefreshComponents: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  outages: OutageMapItem[];
  workOrders: WorkOrderMapItem[];
  includeOutages: boolean;
  includeWorkOrders: boolean;
  /** Seçili şebeke elemanı — satır vurgusu ve haritadaki `feature-state` bunu izler. */
  selectedComponentId: string | undefined;
  onSelectComponent: (id: string) => void;
  selectedOperationId: string | undefined;
  onSelectOperation: (kind: 'outage' | 'workOrder', id: string) => void;
}

/**
 * Alan seçiminin sonuç listesi (sol panel).
 *
 * `DataGrid`'in kısıtlı bir kullanımıdır: sıralama ve sütun filtresi yok, çünkü daraltma
 * zaten sağdaki alan panelinde yapılıyor. Satıra tıklamak öğeyi haritada vurgular VE ilgili
 * özet panelini açar; ID'ler artık ayrı bir bağlantı değil, düz bilgi metnidir.
 */
export function AreaResultPanel({
  onClose,
  components,
  isLoadingComponents,
  isFetchingComponents,
  onRefreshComponents,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  outages,
  workOrders,
  includeOutages,
  includeWorkOrders,
  selectedComponentId,
  onSelectComponent,
  selectedOperationId,
  onSelectOperation,
}: AreaResultPanelProps) {
  const { t } = useTranslation();
  const labels = useLabels();
  const [tab, setTab] = useState<ResultTab>('components');
  const [recordPage, setRecordPage] = useState(1);

  const componentColumns = useMemo<ColumnDef<NetworkComponentAreaItem>[]>(
    () => [
      {
        accessorKey: 'id',
        header: t('map.result.column.id'),
        cell: ({ row }) => <span className="font-mono">{row.original.id}</span>,
      },
      {
        accessorKey: 'type',
        header: t('map.result.column.type'),
        cell: ({ row }) => t(`network.enum.componentType.${row.original.type}`),
      },
      { accessorKey: 'name', header: t('map.result.column.name') },
      {
        accessorKey: 'districtName',
        header: t('map.result.column.district', undefined, 'İlçe'),
        cell: ({ row }) => row.original.districtName ?? '—',
      },
      {
        accessorKey: 'unitName',
        header: t('map.result.column.unit'),
        cell: ({ row }) => row.original.unitName ?? '—',
      },
    ],
    [t],
  );

  // Kesinti/iş emri satırlarında ID artık ayrı bir bağlantı değildir: satırın tamamı zaten
  // tıklanabilir ve özet paneli açar (bkz. `onRowClick`). İlçe/mahalle en solda — elemanlar
  // sekmesindeki gibi konum önce, kayıt kimliği bilgi amaçlı düz metin.
  const outageColumns = useMemo<ColumnDef<OutageMapItem>[]>(
    () => [
      {
        accessorKey: 'districtName',
        header: t('map.result.column.district', undefined, 'İlçe'),
        cell: ({ row }) => row.original.districtName ?? '—',
      },
      {
        accessorKey: 'unitName',
        header: t('map.result.column.unit'),
        cell: ({ row }) => row.original.unitName ?? '—',
      },
      {
        accessorKey: 'id',
        header: t('map.result.column.record'),
        cell: ({ row }) => <span className="font-mono">{row.original.id.slice(0, 8)}</span>,
      },
      {
        accessorKey: 'status',
        header: t('map.result.column.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'cbsId',
        header: t('map.result.column.component'),
        cell: ({ row }) => <span className="font-mono">{row.original.cbsId}</span>,
      },
    ],
    [t],
  );

  const workOrderColumns = useMemo<ColumnDef<WorkOrderMapItem>[]>(
    () => [
      {
        accessorKey: 'districtName',
        header: t('map.result.column.district', undefined, 'İlçe'),
        cell: ({ row }) => row.original.districtName ?? '—',
      },
      {
        accessorKey: 'unitName',
        header: t('map.result.column.unit'),
        cell: ({ row }) => row.original.unitName ?? '—',
      },
      {
        accessorKey: 'id',
        header: t('map.result.column.record'),
        cell: ({ row }) => <span className="font-mono">{row.original.id.slice(0, 8)}</span>,
      },
      {
        accessorKey: 'type',
        header: t('map.result.column.type'),
        cell: ({ row }) => labels.workOrderType(row.original.type),
      },
      {
        accessorKey: 'status',
        header: t('map.result.column.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [t, labels],
  );

  const tabs: { id: ResultTab; label: string; count: number; visible: boolean }[] = [
    { id: 'components', label: t('map.result.tab.components'), count: components?.total ?? 0, visible: true },
    { id: 'outages', label: t('map.result.tab.outages'), count: outages.length, visible: includeOutages },
    { id: 'workOrders', label: t('map.result.tab.workOrders'), count: workOrders.length, visible: includeWorkOrders },
  ];

  // Kayıt sekmelerinin sayfalaması istemcide: iki liste de bellekte, sunucuya gitmeye
  // gerek yok. `slice` her sekmede kendi dizisi üzerinde çalışır.
  const sliceOf = <T,>(items: T[]): T[] => items.slice((recordPage - 1) * RECORD_PAGE_SIZE, recordPage * RECORD_PAGE_SIZE);
  const recordTotal = tab === 'outages' ? outages.length : workOrders.length;
  const recordTotalPages = Math.max(1, Math.ceil(recordTotal / RECORD_PAGE_SIZE));

  const changeTab = (next: ResultTab) => {
    setTab(next);
    setRecordPage(1);
  };

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('map.result.title')}</h2>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={t('common.action.close')} onClick={onClose}>
          <FiX />
        </button>
      </header>

      <nav className={styles.tabs}>
        {tabs
          .filter((item) => item.visible)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={clsx(styles.tab, tab === item.id && styles.tabActive)}
              aria-pressed={tab === item.id}
              onClick={() => changeTab(item.id)}
            >
              {item.label}
              <span className={styles.tabCount}>{item.count.toLocaleString('tr-TR')}</span>
            </button>
          ))}
      </nav>

      <div className={styles.body}>
        {tab === 'components' && (
          <DataGrid
            columns={componentColumns}
            data={components?.items ?? []}
            page={page}
            pageSize={pageSize}
            total={components?.total ?? 0}
            totalPages={components?.totalPages ?? 1}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            onRefresh={onRefreshComponents}
            filterValues={{}}
            onFilterChange={() => undefined}
            hideToolbar
            isLoading={isLoadingComponents}
            isFetching={isFetchingComponents}
            emptyMessage={t('map.result.empty')}
            onRowClick={(item) => onSelectComponent(item.id)}
            isRowSelected={(item) => item.id === selectedComponentId}
          />
        )}

        {tab === 'outages' && (
          <DataGrid
            columns={outageColumns}
            data={sliceOf(outages)}
            page={recordPage}
            pageSize={RECORD_PAGE_SIZE}
            total={recordTotal}
            totalPages={recordTotalPages}
            onPageChange={setRecordPage}
            // Kayıt sekmelerinde sayfa boyutu sabittir: veri zaten bellekte, ayarlanacak bir maliyet yok.
            onPageSizeChange={() => undefined}
            onRefresh={onRefreshComponents}
            filterValues={{}}
            onFilterChange={() => undefined}
            hideToolbar
            emptyMessage={t('map.result.empty')}
            onRowClick={(item) => onSelectOperation('outage', item.id)}
            isRowSelected={(item) => item.id === selectedOperationId}
          />
        )}

        {tab === 'workOrders' && (
          <DataGrid
            columns={workOrderColumns}
            data={sliceOf(workOrders)}
            page={recordPage}
            pageSize={RECORD_PAGE_SIZE}
            total={recordTotal}
            totalPages={recordTotalPages}
            onPageChange={setRecordPage}
            onPageSizeChange={() => undefined}
            onRefresh={onRefreshComponents}
            filterValues={{}}
            onFilterChange={() => undefined}
            hideToolbar
            emptyMessage={t('map.result.empty')}
            onRowClick={(item) => onSelectOperation('workOrder', item.id)}
            isRowSelected={(item) => item.id === selectedOperationId}
          />
        )}

        {components?.overflowed && tab === 'components' && (
          <p className={styles.overflowHint}>{t('map.area.overflowed')}</p>
        )}
      </div>
    </aside>
  );
}
