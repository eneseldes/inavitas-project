import type { ColumnDef } from '@tanstack/react-table';
import { FiEdit2, FiLink } from 'react-icons/fi';
import { clsx } from 'clsx';
import type { ColumnMeta } from '../../shared/components/DataGrid.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { ORIGIN_LABELS, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPE_LABELS } from '../../shared/labels.ts';
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES, type WorkOrder, type WorkOrderStatus } from '../../types/work-order.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

/**
 * work-order-service/src/domain/state-machine.ts'in UI yansıması — bkz.
 * outages/columns.tsx için aynı gerekçe. `export`: EditWorkOrderDialog aynı
 * listeyi kullanıyor, iki kopya tutmuyoruz.
 */
export const NEXT_STATUSES: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  STARTED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ENERGIZED', 'CANCELLED'],
  ENERGIZED: ['DONE', 'CANCELLED'],
  DONE: ['CANCELLED'],
  CANCELLED: [],
};

const STATUS_FILTER_OPTIONS = WORK_ORDER_STATUSES.map((status) => ({ value: status, label: WORK_ORDER_STATUS_LABELS[status] }));
const TYPE_FILTER_OPTIONS = WORK_ORDER_TYPES.map((type) => ({ value: type, label: WORK_ORDER_TYPE_LABELS[type] }));

export function buildWorkOrderColumns(
  onOpenOutage: (outageId: string) => void,
  onChangeStatus: (workOrder: WorkOrder, nextStatus: WorkOrderStatus) => void,
  onEdit: (workOrder: WorkOrder) => void,
): ColumnDef<WorkOrder>[] {
  return [
    {
      id: 'createdAt',
      header: 'Oluşturulma',
      accessorFn: (row) => row.createdAt,
      cell: (ctx) => formatDate(ctx.getValue<string>()),
      meta: { sortField: 'createdAt' } satisfies ColumnMeta,
    },
    {
      id: 'gisId',
      header: 'GIS ID',
      accessorFn: (row) => row.gisId,
      cell: (ctx) => <span className="font-mono">{ctx.getValue<string>()}</span>,
      meta: {
        sortField: 'gisId',
        filter: { field: 'gisId', type: 'text', placeholder: 'ör. CB-10' },
      } satisfies ColumnMeta,
    },
    {
      id: 'type',
      header: 'Tip',
      accessorFn: (row) => row.type,
      cell: (ctx) => <span>{WORK_ORDER_TYPE_LABELS[ctx.getValue<WorkOrder['type']>()]}</span>,
      meta: {
        sortField: 'type',
        filter: { field: 'type', type: 'multiselect', options: TYPE_FILTER_OPTIONS },
      } satisfies ColumnMeta,
    },
    {
      id: 'status',
      header: 'Durum',
      accessorFn: (row) => row.status,
      cell: (ctx) => <StatusBadge status={ctx.getValue<WorkOrder['status']>()} />,
      meta: {
        sortField: 'status',
        filter: { field: 'status', type: 'multiselect', options: STATUS_FILTER_OPTIONS },
      } satisfies ColumnMeta,
    },
    {
      id: 'origin',
      header: 'Kaynak',
      accessorFn: (row) => row.origin,
      cell: (ctx) => {
        const origin = ctx.getValue<WorkOrder['origin']>();
        return <span className={origin === 'SYSTEM' ? undefined : 'text-muted'}>{ORIGIN_LABELS[origin]}</span>;
      },
    },
    {
      id: 'outageId',
      header: 'Kesinti',
      accessorFn: (row) => row.outageId,
      // FR-5.7: ilişkili kayıt ID'si tıklanabilir, karşı ekranda o kaydı filtreli açar.
      cell: (ctx) => {
        const outageId = ctx.getValue<string | null>();
        if (!outageId) return <span className="text-muted">—</span>;
        return (
          <button type="button" onClick={() => onOpenOutage(outageId)} className="link" title="Kesinti ekranında aç">
            <FiLink />
            {outageId.slice(0, 8)}
          </button>
        );
      },
    },
    {
      id: 'actions',
      header: 'İşlemler',
      cell: (ctx) => {
        const workOrder = ctx.row.original;
        const options = NEXT_STATUSES[workOrder.status];

        return (
          <div className="actions-cell">
            <button type="button" onClick={() => onEdit(workOrder)} className="icon-btn icon-btn--sm" title="İş emrini güncelle">
              <FiEdit2 />
            </button>
            {options.length > 0 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onChangeStatus(workOrder, e.target.value as WorkOrderStatus);
                  e.target.value = '';
                }}
                className={clsx('select', 'select--compact')}
              >
                <option value="" disabled>
                  Geçiş seç…
                </option>
                {options.map((status) => (
                  <option key={status} value={status}>
                    → {WORK_ORDER_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      },
    },
  ];
}
