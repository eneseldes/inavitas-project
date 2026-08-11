import type { ColumnDef } from '@tanstack/react-table';
import { FiLink } from 'react-icons/fi';
import type { ColumnMeta } from '../../shared/components/DataGrid.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { OUTAGE_STATUS_LABELS, ORIGIN_LABELS } from '../../shared/labels.ts';
import { OUTAGE_STATUSES, type Outage, type OutageStatus } from '../../types/outage.ts';

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

const STATUS_FILTER_OPTIONS = OUTAGE_STATUSES.map((status) => ({ value: status, label: OUTAGE_STATUS_LABELS[status] }));

export function buildOutageColumns(onOpenWorkOrder: (workOrderId: string) => void): ColumnDef<Outage>[] {
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
      id: 'status',
      header: 'Durum',
      accessorFn: (row) => row.status,
      cell: (ctx) => <StatusBadge status={ctx.getValue<Outage['status']>()} />,
      meta: {
        sortField: 'status',
        filter: { field: 'status', type: 'multiselect', options: STATUS_FILTER_OPTIONS },
      } satisfies ColumnMeta,
    },
    {
      id: 'startedAt',
      header: 'Başlangıç',
      accessorFn: (row) => row.startedAt,
      cell: (ctx) => formatDate(ctx.getValue<string>()),
      meta: { sortField: 'startedAt' } satisfies ColumnMeta,
    },
    {
      id: 'endedAt',
      header: 'Bitiş',
      accessorFn: (row) => row.endedAt,
      cell: (ctx) => formatDate(ctx.getValue<string | null>()),
    },
    {
      id: 'durationMinutes',
      header: 'Süre (dk)',
      accessorFn: (row) => row.durationMinutes,
      cell: (ctx) => ctx.getValue<number | null>() ?? '—',
    },
    {
      id: 'origin',
      header: 'Kaynak',
      accessorFn: (row) => row.origin,
      cell: (ctx) => {
        const origin = ctx.getValue<Outage['origin']>();
        return <span className={origin === 'SYSTEM' ? undefined : 'text-muted'}>{ORIGIN_LABELS[origin]}</span>;
      },
    },
    {
      id: 'workOrderId',
      header: 'İş Emri',
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
            title="İş emri ekranında aç"
          >
            <FiLink />
            {workOrderId.slice(0, 8)}
          </button>
        );
      },
    },
  ];
}
