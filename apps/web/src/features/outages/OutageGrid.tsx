import { useMemo, useState } from 'react';
import { FiPlus, FiX } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataGrid, type FilterValue } from '../../shared/components/DataGrid.tsx';
import type { DateFilterValue } from '../../shared/components/ColumnFilter.tsx';
import { LiveIndicator } from '../../shared/components/LiveIndicator.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { SortDirection } from '../../types/api.ts';
import type { Outage, OutageStatus } from '../../types/outage.ts';
import { CreateOutageDialog } from './CreateOutageDialog.tsx';
import { OutageDetailSection } from './OutageDetailSection.tsx';
import { buildOutageColumns } from './columns.tsx';
import styles from './OutageGrid.module.scss';
import { useOutage, useOutages } from './useOutages.ts';
import { useOutageStream } from './useOutageStream.ts';

export function OutageGrid() {
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const labels = useLabels();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLive = useOutageStream();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ field: string; dir: SortDirection }>({ field: 'createdAt', dir: 'desc' });
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>({
    gisId: '',
    status: [],
    origin: [],
    createdAt: { operator: 'between', from: '', to: '' },
    startedAt: { operator: 'between', from: '', to: '' },
  });
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedOutageId, setSelectedOutageId] = useState<string | null>(null);

  const handleFilterChange = (field: string, value: FilterValue) => {
    setFilterValues((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const query = useMemo(() => {
    const createdAtVal = filterValues.createdAt as DateFilterValue | undefined;
    const startedAtVal = filterValues.startedAt as DateFilterValue | undefined;

    return {
      page,
      pageSize,
      sort,
      filters: {
        gisId: (filterValues.gisId as string) || undefined,
        status: (filterValues.status as OutageStatus[])?.length ? (filterValues.status as OutageStatus[]) : undefined,
        origin: (filterValues.origin as ('USER' | 'SYSTEM')[])?.length ? (filterValues.origin as ('USER' | 'SYSTEM')[]) : undefined,
        createdAtFrom: createdAtVal?.from || undefined,
        createdAtTo: createdAtVal?.to || undefined,
        startedAtFrom: startedAtVal?.from || undefined,
        startedAtTo: startedAtVal?.to || undefined,
      },
    };
  }, [page, pageSize, sort, filterValues]);

  const { data, isLoading, isFetching, refetch } = useOutages(query);

  // İlişkili kayıt seçildiyse vurgulama (highlight) bilgisi ve seçili durum
  const relatedId = searchParams.get('relatedOutageId') ?? undefined;
  const activeOutageId = selectedOutageId ?? relatedId;

  const { data: activeOutageFromQuery } = useOutage(activeOutageId ?? undefined);

  // Seçili kesintiyi tablo listesinden veya tekli sorgudan alma
  const activeOutage = useMemo(() => {
    if (!activeOutageId) return null;
    return data?.items.find((item) => item.id === activeOutageId) ?? activeOutageFromQuery ?? null;
  }, [activeOutageId, data?.items, activeOutageFromQuery]);

  // Sol listede seçili kayıt yoksa listenin başına ekle
  const outagesList = useMemo(() => {
    const items = data?.items ?? [];
    if (activeOutage && !items.some((item) => item.id === activeOutage.id)) {
      return [activeOutage, ...items];
    }
    return items;
  }, [data?.items, activeOutage]);

  const columns = useMemo(
    () => buildOutageColumns(t, labels, (workOrderId) => navigate(`/work-orders?relatedWorkOrderId=${workOrderId}`)),
    [t, labels, navigate],
  );

  const handleBack = () => {
    setSelectedOutageId(null);
    if (relatedId) {
      searchParams.delete('relatedOutageId');
      setSearchParams(searchParams);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{t('outage.page.title')}</h1>
        <LiveIndicator connected={isLive} />
      </div>

      {relatedId && !activeOutageId && (
        <div className={styles.relatedBanner}>
          {activeOutageFromQuery ? (
            <span>
              {t('outage.related.label')} <span className="font-mono">{activeOutageFromQuery.id}</span> —{' '}
              <StatusBadge status={activeOutageFromQuery.status} /> — {t('outage.related.gisLabel')}{' '}
              {activeOutageFromQuery.gisId}
            </span>
          ) : (
            <span>{t('outage.related.loading')}</span>
          )}
          <button
            type="button"
            onClick={() => {
              searchParams.delete('relatedOutageId');
              setSearchParams(searchParams);
            }}
            className={styles.relatedDismiss}
          >
            <FiX />
          </button>
        </div>
      )}

      {activeOutage ? (
        <OutageDetailSection
          outage={activeOutage}
          outages={outagesList}
          onSelectOutage={(item) => setSelectedOutageId(item.id)}
          onBack={handleBack}
          onOpenWorkOrder={(workOrderId) => navigate(`/work-orders?relatedWorkOrderId=${workOrderId}`)}
        />
      ) : (
        <DataGrid<Outage>
          columns={columns}
          data={data?.items ?? []}
          page={data?.page ?? page}
          pageSize={data?.pageSize ?? pageSize}
          total={data?.total ?? 0}
          totalPages={data?.totalPages ?? 1}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onRefresh={() => void refetch()}
          filterValues={filterValues}
          onFilterChange={handleFilterChange}
          isLoading={isLoading}
          isFetching={isFetching}
          onRowClick={(outage) => setSelectedOutageId(outage.id)}
          emptyMessage={t('outage.table.empty')}
          toolbarActions={
            hasPermission('outage:write') && (
              <button type="button" onClick={() => setCreateOpen(true)} className="btn btn--primary">
                <FiPlus /> {t('outage.action.new')}
              </button>
            )
          }
        />
      )}

      {isCreateOpen && <CreateOutageDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}


