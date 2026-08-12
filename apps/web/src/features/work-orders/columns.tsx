import type { ColumnDef } from '@tanstack/react-table';
import { FiLink } from 'react-icons/fi';
import type { ColumnMeta } from '../../shared/components/DataGrid.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import type { TranslateFn } from '../i18n/I18nProvider.tsx';
import type { useLabels } from '../i18n/useLabels.ts';
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES, type WorkOrder, type WorkOrderStatus } from '../../types/work-order.ts';

type Labels = ReturnType<typeof useLabels>;

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

export function buildWorkOrderColumns(
  t: TranslateFn,
  labels: Labels,
  onOpenOutage: (outageId: string) => void,
): ColumnDef<WorkOrder>[] {
  const statusFilterOptions = WORK_ORDER_STATUSES.map((status) => ({ value: status, label: labels.workOrderStatus(status) }));
  const typeFilterOptions = WORK_ORDER_TYPES.map((type) => ({ value: type, label: labels.workOrderType(type) }));
  const originFilterOptions = [
    { value: 'USER', label: labels.origin('USER') },
    { value: 'SYSTEM', label: labels.origin('SYSTEM') },
  ];

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
      header: t('work-order.column.createdAt'),
      accessorFn: (row) => row.createdAt,
      cell: (ctx) => formatDate(ctx.getValue<string>()),
      meta: {
        sortField: 'createdAt',
        filter: { field: 'createdAt', type: 'date' },
      } satisfies ColumnMeta,
    },
    {
      id: 'gisId',
      header: 'GIS ID',
      accessorFn: (row) => row.gisId,
      cell: (ctx) => <span className="font-mono">{ctx.getValue<string>()}</span>,
      meta: {
        sortField: 'gisId',
        filter: { field: 'gisId', type: 'text', placeholder: t('common.placeholder.gisIdExample') },
      } satisfies ColumnMeta,
    },
    {
      id: 'type',
      header: t('work-order.column.type'),
      accessorFn: (row) => row.type,
      cell: (ctx) => <span>{labels.workOrderType(ctx.getValue<WorkOrder['type']>())}</span>,
      meta: {
        sortField: 'type',
        filter: { field: 'type', type: 'multiselect', options: typeFilterOptions },
      } satisfies ColumnMeta,
    },
    {
      id: 'status',
      header: t('work-order.column.status'),
      accessorFn: (row) => row.status,
      cell: (ctx) => <StatusBadge status={ctx.getValue<WorkOrder['status']>()} />,
      meta: {
        sortField: 'status',
        filter: { field: 'status', type: 'multiselect', options: statusFilterOptions },
      } satisfies ColumnMeta,
    },
    {
      id: 'origin',
      header: t('work-order.column.origin'),
      accessorFn: (row) => row.origin,
      cell: (ctx) => {
        const origin = ctx.getValue<WorkOrder['origin']>();
        return <span className={origin === 'SYSTEM' ? undefined : 'text-muted'}>{labels.origin(origin)}</span>;
      },
      meta: {
        filter: { field: 'origin', type: 'multiselect', options: originFilterOptions },
      } satisfies ColumnMeta,
    },
    {
      id: 'outageId',
      header: t('work-order.column.outageId'),
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
            title={t('work-order.action.openOutage')}
          >
            <FiLink />
            {outageId.slice(0, 8)}
          </button>
        );
      },
    },
  ];
}
