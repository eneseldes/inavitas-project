import type { ColumnDef } from '@tanstack/react-table';
import { RecordLink } from '../../shared/components/RecordLink.tsx';
import type { ColumnMeta } from '../../shared/components/DataGrid.tsx';
import type { DateFilterValue, NumberRangeFilterValue } from '../../shared/components/ColumnFilter.tsx';
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
        id: 'createdAt',
        header: t('outage.column.createdAt'),
        accessorFn: (row) => row.createdAt,
        cell: (ctx) => formatDate(ctx.getValue<string>()),
        meta: {
          sortField: 'createdAt',
          filter: {
            key: 'createdAt',
            type: 'date',
            toQuery: (v) => {
              const { from, to } = v as DateFilterValue;
              return { createdAtFrom: from || undefined, createdAtTo: to || undefined };
            },
          },
        } satisfies ColumnMeta,
      },
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
        id: 'cbsId',
        header: 'CBS ID',
        accessorFn: (row) => row.cbsId,
        cell: (ctx) => <span className="font-mono">{ctx.getValue<string>()}</span>,
        meta: {
          sortField: 'cbsId',
          filter: {
            key: 'cbsId',
            type: 'text',
            toQuery: (v) => ({ cbsId: (v as string) || undefined }),
          },
        } satisfies ColumnMeta,
      },
      {
        id: 'status',
        header: t('outage.column.status'),
        accessorFn: (row) => row.status,
        cell: (ctx) => <StatusBadge status={ctx.getValue<Outage['status']>()} />,
        meta: {
          sortField: 'status',
          filter: {
            key: 'status',
            type: 'multiselect',
            options: statusFilterOptions,
            toQuery: (v) => ({ status: (v as string[]).length ? v : undefined }),
          },
        } satisfies ColumnMeta,
      },
      {
        id: 'startedAt',
        header: t('outage.column.startedAt'),
        accessorFn: (row) => row.startedAt,
        cell: (ctx) => formatDate(ctx.getValue<string>()),
        meta: {
          sortField: 'startedAt',
          filter: {
            key: 'startedAt',
            type: 'date',
            toQuery: (v) => {
              const { from, to } = v as DateFilterValue;
              return { startedAtFrom: from || undefined, startedAtTo: to || undefined };
            },
          },
        } satisfies ColumnMeta,
      },
      {
        id: 'endedAt',
        header: t('outage.column.endedAt'),
        accessorFn: (row) => row.endedAt,
        cell: (ctx) => formatDate(ctx.getValue<string | null>()),
        meta: {
          filter: {
            key: 'endedAt',
            type: 'date',
            toQuery: (v) => {
              const { from, to } = v as DateFilterValue;
              return { endedAtFrom: from || undefined, endedAtTo: to || undefined };
            },
          },
        } satisfies ColumnMeta,
      },
      {
        id: 'durationMinutes',
        header: t('outage.column.durationMinutes'),
        accessorFn: (row) => row.durationMinutes,
        cell: (ctx) => ctx.getValue<number | null>() ?? '—',
        meta: {
          filter: {
            key: 'duration',
            type: 'numberRange',
            toQuery: (v) => {
              const { min, max } = v as NumberRangeFilterValue;
              return { durationMinMinutes: min, durationMaxMinutes: max };
            },
          },
        } satisfies ColumnMeta,
      },
      {
        id: 'affectedCustomerCount',
        header: t('outage.column.affectedCustomerCount'),
        accessorFn: (row) => row.affectedCustomerCount,
        // Etki olay akışıyla geldiği için ilk saniyelerde henüz boş olabilir; bu bir hata
        // değil, geçici bir durumdur (bkz. impactStatus).
        cell: (ctx) => {
          const outage = ctx.row.original;
          if (outage.impactStatus === 'PENDING') return <span className="text-muted">…</span>;
          if (outage.impactStatus === 'UNAVAILABLE') return <span className="text-muted">—</span>;
          return outage.affectedCustomerCount ?? '—';
        },
        meta: {
          sortField: 'affectedCustomerCount',
          filter: {
            key: 'affectedCustomers',
            type: 'numberRange',
            toQuery: (v) => {
              const { min, max } = v as NumberRangeFilterValue;
              return { minAffectedCustomers: min, maxAffectedCustomers: max };
            },
          },
        } satisfies ColumnMeta,
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
          filter: {
            key: 'origin',
            type: 'multiselect',
            options: originFilterOptions,
            toQuery: (v) => ({ origin: (v as string[]).length ? v : undefined }),
          },
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
          <RecordLink
            id={workOrderId}
            onClick={() => onOpenWorkOrder(workOrderId)}
            title={t('outage.action.openWorkOrder')}
            stopPropagation
          />
        );
      },
      meta: {
        // Kimliğin kendisi aranmaz (kullanıcı UUID ezberlemiyor); anlamlı olan soru
        // "bu kesintiye iş emri bağlı mı" ve sunucu bunu `hasWorkOrder` ile zaten
        // cevaplıyordu — filtre yalnızca arayüzde eksikti.
        filter: {
          key: 'hasWorkOrder',
          type: 'select',
          options: [
            { value: 'true', label: t('common.filter.relation.linked') },
            { value: 'false', label: t('common.filter.relation.unlinked') },
          ],
          toQuery: (v) => ({ hasWorkOrder: v === '' ? undefined : v === 'true' }),
        },
      } satisfies ColumnMeta,
    },
  ];
}
