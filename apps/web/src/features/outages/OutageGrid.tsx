import { useMemo, useState } from 'react';
import { FiPlus, FiX } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataGrid, type FilterValue } from '../../shared/components/DataGrid.tsx';
import { LiveIndicator } from '../../shared/components/LiveIndicator.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useAuth } from '../auth/useAuth.tsx';
import type { SortDirection } from '../../types/api.ts';
import type { Outage, OutageStatus } from '../../types/outage.ts';
import { CreateOutageDialog } from './CreateOutageDialog.tsx';
import { EditOutageDialog } from './EditOutageDialog.tsx';
import { OutageHistoryDialog } from './OutageHistoryDialog.tsx';
import { buildOutageColumns } from './columns.tsx';
import styles from './OutageGrid.module.scss';
import { useOutage, useOutages } from './useOutages.ts';
import { useOutageStream } from './useOutageStream.ts';

export function OutageGrid() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLive = useOutageStream();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ field: string; dir: SortDirection }>({ field: 'createdAt', dir: 'desc' });
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>({ gisId: '', status: [] });
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingOutage, setEditingOutage] = useState<Outage | null>(null);
  const [historyOutage, setHistoryOutage] = useState<Outage | null>(null);

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
        status: (filterValues.status as OutageStatus[])?.length ? (filterValues.status as OutageStatus[]) : undefined,
      },
    }),
    [page, pageSize, sort, filterValues],
  );

  const { data, isLoading, isFetching, refetch } = useOutages(query);

  // İlişkili kayıt seçildiyse vurgulama (highlight) bilgisi yüklenir.
  const relatedId = searchParams.get('relatedOutageId') ?? undefined;
  const { data: relatedOutage } = useOutage(relatedId);

  const columns = useMemo(
    () => buildOutageColumns((workOrderId) => navigate(`/work-orders?relatedWorkOrderId=${workOrderId}`)),
    [navigate],
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Kesintiler</h1>
        <LiveIndicator connected={isLive} />
      </div>

      {relatedId && (
        <div className={styles.relatedBanner}>
          {relatedOutage ? (
            <span>
              İlişkili kesinti: <span className="font-mono">{relatedOutage.id}</span> — <StatusBadge status={relatedOutage.status} /> — GIS: {relatedOutage.gisId}
            </span>
          ) : (
            <span>İlişkili kesinti yükleniyor…</span>
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
        onRowClick={(outage) => setHistoryOutage(outage)}
        emptyMessage="Kesinti kaydı yok"
        toolbarActions={
          hasPermission('outage:write') && (
            <button type="button" onClick={() => setCreateOpen(true)} className="btn btn--primary">
              <FiPlus /> Yeni Kesinti
            </button>
          )
        }
      />

      {isCreateOpen && <CreateOutageDialog onClose={() => setCreateOpen(false)} />}
      {editingOutage && <EditOutageDialog outage={editingOutage} onClose={() => setEditingOutage(null)} />}
      {historyOutage && (
        <OutageHistoryDialog
          outage={historyOutage}
          onClose={() => setHistoryOutage(null)}
          onEdit={() => {
            setHistoryOutage(null);
            setEditingOutage(historyOutage);
          }}
        />
      )}
    </div>
  );
}

