import type { ColumnDef } from '@tanstack/react-table';
import { FiEdit2, FiKey, FiTrash2 } from 'react-icons/fi';
import type { ColumnMeta } from '../../../shared/components/DataGrid.tsx';
import type { TranslateFn } from '../../i18n/I18nProvider.tsx';
import type { UserListItem } from '../../../types/user-management.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export function buildUserColumns(
  t: TranslateFn,
  roleNameByCode: Record<string, string>,
  handlers: {
    onEdit: (user: UserListItem) => void;
    onDelete: (user: UserListItem) => void;
    onResetPassword: (user: UserListItem) => void;
  },
): ColumnDef<UserListItem>[] {
  return [
    {
      id: 'fullName',
      header: t('user-management.column.fullName', undefined, 'Ad Soyad'),
      accessorFn: (row) => row.fullName,
    },
    {
      id: 'email',
      header: t('user-management.column.email', undefined, 'E-posta'),
      accessorFn: (row) => row.email,
      meta: {
        sortField: 'email',
        filter: { field: 'q', type: 'text', placeholder: t('user-management.filter.search') },
      } satisfies ColumnMeta,
    },
    {
      id: 'roles',
      header: t('user-management.column.roles', undefined, 'Roller'),
      accessorFn: (row) => row.roles,
      cell: (ctx) => {
        const codes = ctx.getValue<string[]>();
        if (codes.length === 0) return <span className="text-muted">—</span>;
        return <span>{codes.map((code) => roleNameByCode[code] ?? code).join(', ')}</span>;
      },
    },
    {
      id: 'lastLoginAt',
      header: t('user-management.column.lastLoginAt', undefined, 'Son Giriş'),
      accessorFn: (row) => row.lastLoginAt,
      cell: (ctx) => {
        const value = ctx.getValue<string | null>();
        if (!value) return <span className="text-muted">Hiç giriş yapmadı</span>;
        return dateFormatter.format(new Date(value));
      },
      meta: { sortField: 'lastLoginAt' } satisfies ColumnMeta,
    },
    {
      id: 'actions',
      header: t('user-management.column.actions', undefined, 'İşlemler'),
      cell: (ctx) => {
        const user = ctx.row.original;
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              title={t('common.action.edit', undefined, 'Düzenle')}
              onClick={() => handlers.onEdit(user)}
            >
              <FiEdit2 />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              title={t('common.action.delete', undefined, 'Sil')}
              onClick={() => handlers.onDelete(user)}
            >
              <FiTrash2 />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              title={t('user-management.field.resetPassword', undefined, 'Şifre Sıfırla')}
              onClick={() => handlers.onResetPassword(user)}
            >
              <FiKey />
            </button>
          </div>
        );
      },
    },
  ];
}
