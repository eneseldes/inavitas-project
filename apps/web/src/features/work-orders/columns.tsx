import type { ColumnDef } from '@tanstack/react-table';
import { FiLink } from 'react-icons/fi';
import type { ColumnMeta } from '../../shared/components/DataGrid.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { ORIGIN_LABELS, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPE_LABELS } from '../../shared/labels.ts';
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES, type WorkOrder, type WorkOrderStatus } from '../../types/work-order.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

/**
 * Kullanıcı arayüzünde seçilebilecek sonraki iş emri durumları.
 */
export const NEXT_STATUSES: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  STARTED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ENERGIZED', 'CANCELLED'],
  ENERGIZED: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

const STATUS_FILTER_OPTIONS = WORK_ORDER_STATUSES.map((status) => ({ value: status, label: WORK_ORDER_STATUS_LABELS[status] }));
const TYPE_FILTER_OPTIONS = WORK_ORDER_TYPES.map((type) => ({ value: type, label: WORK_ORDER_TYPE_LABELS[type] }));

export function buildWorkOrderColumns(onOpenOutage: (outageId: string) => void): ColumnDef<WorkOrder>[] {
  return [
    {
      id: 'id',
      header: 'ID',
      accessorFn: (row) => row.id,
      cell: (ctx) => {
        const id = ctx.getValue<string>();
        return (
          <span className="font-mono" title={id}>
            {id.slice(0, 8)}
          </span>
        );
      },
    },
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
      // İlişkili kayıt ID'si tıklanabilir; karşı ekranda ilgili kaydı açar.
      cell: (ctx) => {
        const outageId = ctx.getValue<string | null>();
        if (!outageId) return <span className="text-muted">—</span>;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenOutage(outageId);
            }}
            className="link"
            title="Kesinti ekranında aç"
          >
            <FiLink />
            {outageId.slice(0, 8)}
          </button>
        );
      },
    },
  ];
}
