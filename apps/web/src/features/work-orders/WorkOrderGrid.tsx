import { useMemo, useState } from 'react';
import { FiPlus, FiX } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataGrid, type FilterValue } from '../../shared/components/DataGrid.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useAuth } from '../auth/useAuth.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { ApiError } from '../../shared/api/errors.ts';
import type { SortDirection } from '../../types/api.ts';
import type { WorkOrder, WorkOrderStatus, WorkOrderType } from '../../types/work-order.ts';
import { CreateWorkOrderDialog } from './CreateWorkOrderDialog.tsx';
import { EditWorkOrderDialog } from './EditWorkOrderDialog.tsx';
import { buildWorkOrderColumns } from './columns.tsx';
import styles from './WorkOrderGrid.module.scss';
import { usePatchWorkOrder, useWorkOrder, useWorkOrders } from './useWorkOrders.ts';

export function WorkOrderGrid() {
  const { hasPermission } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ field: string; dir: SortDirection }>({ field: 'createdAt', dir: 'desc' });
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>({ gisId: '', status: [], type: [] });
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);

  const handleFilterChange = (field: string, value: FilterValue) => {
    setFilterValues((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const query = useMemo(
    () => ({
      page,
      pageSize,
      sort,
      filters: {
        gisId: (filterValues.gisId as string) || undefined,
        status: (filterValues.status as WorkOrderStatus[])?.length ? (filterValues.status as WorkOrderStatus[]) : undefined,
        // Backend tek bir `type` kabul ediyor (çoklu değil) — sütun filtresi
        // çoklu seçime izin verse de yalnızca ilk seçileni gönderiyoruz.
        type: (filterValues.type as WorkOrderType[])?.[0],
      },
    }),
    [page, pageSize, sort, filterValues],
  );

  const { data, isLoading, isFetching, refetch } = useWorkOrders(query);
  const patchWorkOrder = usePatchWorkOrder();

  const relatedId = searchParams.get('relatedWorkOrderId') ?? undefined;
  const { data: relatedWorkOrder } = useWorkOrder(relatedId);

  const columns = useMemo(
    () =>
      buildWorkOrderColumns(
        (outageId) => navigate(`/outages?relatedOutageId=${outageId}`),
        async (workOrder, nextStatus) => {
          try {
            await patchWorkOrder.mutateAsync({ id: workOrder.id, status: nextStatus, version: workOrder.version });
            show('success', `İş emri ${nextStatus} durumuna geçti`);
          } catch (err) {
            show('error', err instanceof ApiError ? err.message : 'Durum güncellenemedi');
          }
        },
        (workOrder) => setEditingWorkOrder(workOrder),
      ),
    [patchWorkOrder, show, navigate],
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>İş Emirleri</h1>
      </div>

      {relatedId && (
        <div className={styles.relatedBanner}>
          {relatedWorkOrder ? (
            <span>
              İlişkili iş emri: <span className="font-mono">{relatedWorkOrder.id}</span> — <StatusBadge status={relatedWorkOrder.status} /> — GIS: {relatedWorkOrder.gisId}
            </span>
          ) : (
            <span>İlişkili iş emri yükleniyor…</span>
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

      <DataGrid<WorkOrder>
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
        emptyMessage="İş emri kaydı yok"
        toolbarActions={
          hasPermission('workorder:write') && (
            <button type="button" onClick={() => setCreateOpen(true)} className="btn btn--primary">
              <FiPlus /> Yeni İş Emri
            </button>
          )
        }
      />

      {isCreateOpen && <CreateWorkOrderDialog onClose={() => setCreateOpen(false)} />}
      {editingWorkOrder && <EditWorkOrderDialog workOrder={editingWorkOrder} onClose={() => setEditingWorkOrder(null)} />}
    </div>
  );
}
