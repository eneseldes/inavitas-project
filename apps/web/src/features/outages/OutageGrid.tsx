import { useMemo, useState } from 'react';
import { FiPlus, FiX } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataGrid } from '../../shared/components/DataGrid.tsx';
import { LiveIndicator } from '../../shared/components/LiveIndicator.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useDataGridState } from '../../shared/hooks/useDataGridState.ts';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { Outage, OutageFilters } from '../../types/outage.ts';
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

  const columns = useMemo(
    () => buildOutageColumns(t, labels, (workOrderId) => navigate(`/work-orders?relatedWorkOrderId=${workOrderId}`)),
    [t, labels, navigate],
  );

  const grid = useDataGridState<Outage>({ columns, defaultSort: { field: 'createdAt', dir: 'desc' } });
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedOutageId, setSelectedOutageId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      page: grid.page,
      pageSize: grid.pageSize,
      sort: grid.sort,
      filters: grid.queryFilters as OutageFilters,
    }),
    [grid.page, grid.pageSize, grid.sort, grid.queryFilters],
  );

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
          page={data?.page ?? grid.page}
          pageSize={data?.pageSize ?? grid.pageSize}
          total={data?.total ?? 0}
          totalPages={data?.totalPages ?? 1}
          sort={grid.sort}
          onSortChange={grid.onSortChange}
          onPageChange={grid.onPageChange}
          onPageSizeChange={grid.onPageSizeChange}
          onRefresh={() => void refetch()}
          filterValues={grid.filterValues}
          onFilterChange={grid.onFilterChange}
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


