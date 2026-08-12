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
import type { WorkOrder, WorkOrderFilters } from '../../types/work-order.ts';
import { CreateWorkOrderDialog } from './CreateWorkOrderDialog.tsx';
import { WorkOrderDetailSection } from './WorkOrderDetailSection.tsx';
import { buildWorkOrderColumns } from './columns.tsx';
import styles from './WorkOrderGrid.module.scss';
import { useWorkOrder, useWorkOrders } from './useWorkOrders.ts';
import { useWorkOrderStream } from './useWorkOrderStream.ts';

export function WorkOrderGrid() {
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const labels = useLabels();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLive = useWorkOrderStream();

  const columns = useMemo(
    () => buildWorkOrderColumns(t, labels, (outageId) => navigate(`/outages?relatedOutageId=${outageId}`)),
    [t, labels, navigate],
  );

  const grid = useDataGridState<WorkOrder>({ columns, defaultSort: { field: 'createdAt', dir: 'desc' } });
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      page: grid.page,
      pageSize: grid.pageSize,
      sort: grid.sort,
      filters: grid.queryFilters as WorkOrderFilters,
    }),
    [grid.page, grid.pageSize, grid.sort, grid.queryFilters],
  );

  const { data, isLoading, isFetching, refetch } = useWorkOrders(query);

  const relatedId = searchParams.get('relatedWorkOrderId') ?? undefined;
  const activeWorkOrderId = selectedWorkOrderId ?? relatedId;

  const { data: activeWorkOrderFromQuery } = useWorkOrder(activeWorkOrderId ?? undefined);

  const activeWorkOrder = useMemo(() => {
    if (!activeWorkOrderId) return null;
    return data?.items.find((item) => item.id === activeWorkOrderId) ?? activeWorkOrderFromQuery ?? null;
  }, [activeWorkOrderId, data?.items, activeWorkOrderFromQuery]);

  const workOrdersList = useMemo(() => {
    const items = data?.items ?? [];
    if (activeWorkOrder && !items.some((item) => item.id === activeWorkOrder.id)) {
      return [activeWorkOrder, ...items];
    }
    return items;
  }, [data?.items, activeWorkOrder]);

  const handleBack = () => {
    setSelectedWorkOrderId(null);
    if (relatedId) {
      searchParams.delete('relatedWorkOrderId');
      setSearchParams(searchParams);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{t('work-order.page.title')}</h1>
        <LiveIndicator connected={isLive} />
      </div>

      {relatedId && !activeWorkOrderId && (
        <div className={styles.relatedBanner}>
          {activeWorkOrderFromQuery ? (
            <span>
              {t('work-order.related.label')} <span className="font-mono">{activeWorkOrderFromQuery.id}</span> —{' '}
              <StatusBadge status={activeWorkOrderFromQuery.status} /> — {t('outage.related.gisLabel')}{' '}
              {activeWorkOrderFromQuery.gisId}
            </span>
          ) : (
            <span>{t('work-order.related.loading')}</span>
          )}
          <button
            type="button"
            onClick={() => {
              searchParams.delete('relatedWorkOrderId');
              setSearchParams(searchParams);
            }}
            className={styles.relatedDismiss}
          >
            <FiX />
          </button>
        </div>
      )}

      {activeWorkOrder ? (
        <WorkOrderDetailSection
          workOrder={activeWorkOrder}
          workOrders={workOrdersList}
          onSelectWorkOrder={(item) => setSelectedWorkOrderId(item.id)}
          onBack={handleBack}
          onOpenOutage={(outageId) => navigate(`/outages?relatedOutageId=${outageId}`)}
        />
      ) : (
        <DataGrid<WorkOrder>
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
          onRowClick={(workOrder) => setSelectedWorkOrderId(workOrder.id)}
          emptyMessage={t('work-order.table.empty')}
          toolbarActions={
            hasPermission('workorder:write') && (
              <button type="button" onClick={() => setCreateOpen(true)} className="btn btn--primary">
                <FiPlus /> {t('work-order.action.new')}
              </button>
            )
          }
        />
      )}

      {isCreateOpen && <CreateWorkOrderDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}


