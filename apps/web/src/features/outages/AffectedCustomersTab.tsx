import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataGrid } from '../../shared/components/DataGrid.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import type { Outage, OutageAffectedCustomer } from '../../types/outage.ts';
import { useOutageAffectedCustomers } from './useOutages.ts';

/**
 * "Etkilenen Aboneler" sekmesi — kesintinin `outage_affected_customers` read-model'ini
 * listeler.
 *
 * ⚠️ Bu liste **PII içermez**: tesisat/sözleşme numarası taşımaz, yalnız abone kimliği,
 * idari birim yolu ve abone tipi vardır. Sıfırdan tablo yazılmaz — `DataGrid`'in
 * sıralamasız/filtresiz kısıtlı bir kullanımıdır.
 */
export function AffectedCustomersTab({ outage }: { outage: Outage }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data, isLoading, isFetching, refetch } = useOutageAffectedCustomers(outage.id, page, pageSize);

  const columns = useMemo<ColumnDef<OutageAffectedCustomer>[]>(
    () => [
      {
        id: 'customerId',
        header: t('outage.affectedCustomers.column.customerId', undefined, 'Abone No'),
        accessorFn: (row) => row.customerId,
        cell: (ctx) => <span className="font-mono">{ctx.getValue<string>()}</span>,
      },
      {
        id: 'unitPath',
        header: t('outage.affectedCustomers.column.unitPath', undefined, 'İdari Birim'),
        accessorFn: (row) => row.unitPath,
        cell: (ctx) => <span className="font-mono">{ctx.getValue<string>()}</span>,
      },
      {
        id: 'customerType',
        header: t('outage.affectedCustomers.column.customerType', undefined, 'Abone Tipi'),
        accessorFn: (row) => row.customerType,
        cell: (ctx) => {
          const value = ctx.getValue<string | null>();
          return value ? t(`network.enum.customerType.${value}`, undefined, value) : '—';
        },
      },
    ],
    [t],
  );

  // Etki olay akışıyla geldiği için ilk saniyelerde liste boş olabilir; bu bir hata değil.
  if (outage.impactStatus === 'PENDING') {
    return <p className="text-muted">{t('outage.detail.impactPending', undefined, 'Hesaplanıyor…')}</p>;
  }
  if (outage.impactStatus === 'UNAVAILABLE') {
    return <p className="text-muted">{t('outage.affectedCustomers.unavailable')}</p>;
  }

  return (
    <DataGrid<OutageAffectedCustomer>
      columns={columns}
      data={data?.items ?? []}
      page={page}
      pageSize={pageSize}
      total={data?.total ?? 0}
      totalPages={data?.totalPages ?? 0}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
      }}
      onRefresh={() => void refetch()}
      filterValues={{}}
      onFilterChange={() => undefined}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyMessage={t('outage.affectedCustomers.empty')}
    />
  );
}
