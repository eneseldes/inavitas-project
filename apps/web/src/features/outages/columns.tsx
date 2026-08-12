import type { ColumnDef } from '@tanstack/react-table';
import { FiLink } from 'react-icons/fi';
import type { ColumnMeta } from '../../shared/components/DataGrid.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import type { TranslateFn } from '../i18n/I18nProvider.tsx';
import type { useLabels } from '../i18n/useLabels.ts';
import { OUTAGE_STATUSES, type Outage, type OutageStatus } from '../../types/outage.ts';

type Labels = ReturnType<typeof useLabels>;

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

/**
 * Kullanıcı arayüzünden doğrudan seçilebilen kesinti durum geçişleri:
 *
 * - STARTED durumundaki kesintilerin enerji verildi (ENERGIZED) durumuna geçişi
 *   tamamlanan iş emirleri üzerinden otomatik olarak yönetilir.
 * - ARCHIVED ve CANCELLED durumundaki kesintiler kilitlidir, durum değişikliği yapılamaz.
 *
 * Servis tarafındaki durum makinesi esas otoritedir; bu tablo arayüzde sunulan
 * geçerli işlem seçeneklerini tanımlar.
 */
export const USER_SELECTABLE_NEXT_STATUSES: Record<OutageStatus, OutageStatus[]> = {
  STARTED: ['CANCELLED'],
  ENERGIZED: ['ARCHIVED'],
  ARCHIVED: [],
  CANCELLED: [],
};

/** Arşivlenmiş/iptal edilmiş bir kesinti artık düzenlenemez, geçiş yapılamaz. */
export function isLocked(status: OutageStatus): boolean {
  return status === 'ARCHIVED' || status === 'CANCELLED';
}

export function buildOutageColumns(
  t: TranslateFn,
  labels: Labels,
  onOpenWorkOrder: (workOrderId: string) => void,
): ColumnDef<Outage>[] {
    const statusFilterOptions = OUTAGE_STATUSES.map((status) => ({ value: status, label: labels.outageStatus(status) }));
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
        header: t('outage.column.createdAt'),
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
        id: 'status',
        header: t('outage.column.status'),
        accessorFn: (row) => row.status,
        cell: (ctx) => <StatusBadge status={ctx.getValue<Outage['status']>()} />,
        meta: {
          sortField: 'status',
          filter: { field: 'status', type: 'multiselect', options: statusFilterOptions },
        } satisfies ColumnMeta,
      },
      {
        id: 'startedAt',
        header: t('outage.column.startedAt'),
        accessorFn: (row) => row.startedAt,
        cell: (ctx) => formatDate(ctx.getValue<string>()),
        meta: {
          sortField: 'startedAt',
          filter: { field: 'startedAt', type: 'date' },
        } satisfies ColumnMeta,
      },
      {
        id: 'endedAt',
        header: t('outage.column.endedAt'),
        accessorFn: (row) => row.endedAt,
        cell: (ctx) => formatDate(ctx.getValue<string | null>()),
      },
      {
        id: 'durationMinutes',
        header: t('outage.column.durationMinutes'),
        accessorFn: (row) => row.durationMinutes,
        cell: (ctx) => ctx.getValue<number | null>() ?? '—',
      },
      {
        id: 'origin',
        header: t('outage.column.origin'),
        accessorFn: (row) => row.origin,
        cell: (ctx) => {
          const origin = ctx.getValue<Outage['origin']>();
          return <span className={origin === 'SYSTEM' ? undefined : 'text-muted'}>{labels.origin(origin)}</span>;
        },
        meta: {
          filter: { field: 'origin', type: 'multiselect', options: originFilterOptions },
        } satisfies ColumnMeta,
      },
    {
      id: 'workOrderId',
      header: t('outage.column.workOrderId'),
      accessorFn: (row) => row.workOrderId,
      // İlişkili kayıt ID'si tıklanabilir; karşı ekranda ilgili kaydı açar.
      cell: (ctx) => {
        const workOrderId = ctx.getValue<string | null>();
        if (!workOrderId) return <span className="text-muted">—</span>;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenWorkOrder(workOrderId);
            }}
            className="link"
            title={t('outage.action.openWorkOrder')}
          >
            <FiLink />
            {workOrderId.slice(0, 8)}
          </button>
        );
      },
    },
  ];
}
