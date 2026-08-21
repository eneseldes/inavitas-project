import type { ColumnDef } from '@tanstack/react-table';
import { FiEdit2, FiKey, FiTrash2 } from 'react-icons/fi';
import type { ColumnMeta } from '../../../shared/components/DataGrid.tsx';
import type { DateFilterValue } from '../../../shared/components/ColumnFilter.tsx';
import type { TranslateFn } from '../../i18n/I18nProvider.tsx';
import type { AssignmentSummary, UserListItem } from '../../../types/user-management.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/** Kolona sığan atama sayısı; kalanı "+N" rozetiyle özetlenir. */
const VISIBLE_ASSIGNMENTS = 2;

/** "Saha Operatörü @ Keçiören" — birim adı read-model'de yoksa ham yol yazılır. */
function formatAssignment(
  assignment: AssignmentSummary,
  roleNameByCode: Record<string, string>,
): string {
  return `${roleNameByCode[assignment.roleCode] ?? assignment.roleCode} @ ${assignment.unitName ?? assignment.unitPath}`;
}

export function buildUserColumns(
  t: TranslateFn,
  roleNameByCode: Record<string, string>,
  handlers: {
    onEdit: (user: UserListItem) => void;
    onDelete: (user: UserListItem) => void;
    onResetPassword: (user: UserListItem) => void;
  },
): ColumnDef<UserListItem>[] {
  const roleFilterOptions = Object.entries(roleNameByCode).map(([value, label]) => ({ value, label }));

  return [
    {
      id: 'fullName',
      header: t('user-management.column.fullName', undefined, 'Ad Soyad'),
      accessorFn: (row) => row.fullName,
      meta: {
        sortField: 'fullName',
        // Placeholder metni "ad veya e-posta ara" olduğu için sonuç genel arama (`q`) — sadece ad değil.
        filter: {
          key: 'q',
          type: 'text',
          toQuery: (v) => ({ q: (v as string) || undefined }),
        },
      } satisfies ColumnMeta,
    },
    {
      id: 'email',
      header: t('user-management.column.email', undefined, 'E-posta'),
      accessorFn: (row) => row.email,
      meta: {
        sortField: 'email',
        filter: {
          key: 'email',
          type: 'text',
          toQuery: (v) => ({ email: (v as string) || undefined }),
        },
      } satisfies ColumnMeta,
    },
    {
      id: 'roles',
      header: t('user-management.column.roles', undefined, 'Roller'),
      accessorFn: (row) => row.assignments,
      // Yetki artık "ne yapabilir" değil "nerede ne yapabilir" — kolon kapsamı da gösterir.
      cell: (ctx) => {
        const assignments = ctx.getValue<AssignmentSummary[]>();
        if (assignments.length === 0) return <span className="text-muted">—</span>;

        const shown = assignments.slice(0, VISIBLE_ASSIGNMENTS);
        const rest = assignments.length - shown.length;

        return (
          <span title={assignments.map((a) => formatAssignment(a, roleNameByCode)).join(', ')}>
            {shown.map((a) => formatAssignment(a, roleNameByCode)).join(', ')}
            {rest > 0 && <span className="badge badge--gray">+{rest}</span>}
          </span>
        );
      },
      meta: {
        filter: {
          key: 'roles',
          type: 'multiselect',
          options: roleFilterOptions,
          toQuery: (v) => ({ roles: (v as string[]).length ? v : undefined }),
        },
      } satisfies ColumnMeta,
    },
    {
      id: 'lastLoginAt',
      header: t('user-management.column.lastLoginAt', undefined, 'Son Giriş'),
      accessorFn: (row) => row.lastLoginAt,
      cell: (ctx) => {
        const value = ctx.getValue<string | null>();
        if (!value) return <span className="text-muted">{t('user-management.column.neverLoggedIn', undefined, 'Hiç giriş yapmadı')}</span>;
        return dateFormatter.format(new Date(value));
      },
      meta: {
        sortField: 'lastLoginAt',
        filter: {
          key: 'lastLoginAt',
          type: 'date',
          toQuery: (v) => {
            const { from, to } = v as DateFilterValue;
            return { lastLoginAtFrom: from || undefined, lastLoginAtTo: to || undefined };
          },
        },
      } satisfies ColumnMeta,
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
