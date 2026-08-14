import { useMemo, useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import { DataGrid } from '../../../shared/components/DataGrid.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { useDataGridState } from '../../../shared/hooks/useDataGridState.ts';
import { ApiError } from '../../../shared/api/errors.ts';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import { useLabels } from '../../i18n/useLabels.ts';
import type { UserDetail, UserListItem } from '../../../types/user-management.ts';
import { fetchUser } from '../api.ts';
import { useRoles } from '../roles/useRoles.ts';
import { buildUserColumns } from './columns.tsx';
import { ResetPasswordModal } from './ResetPasswordModal.tsx';
import { UserFormModal } from './UserFormModal.tsx';
import { usePatchUser, useUsers } from './useUsers.ts';
import styles from './UsersView.module.scss';

export function UsersView() {
  const { t } = useTranslation();
  const labels = useLabels();
  const { show } = useToast();

  const [modalUser, setModalUser] = useState<UserDetail | null | 'create'>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserListItem | null>(null);

  const { data: rolesData } = useRoles();
  const patchUser = usePatchUser();

  const roleNameByCode = useMemo(
    () => Object.fromEntries((rolesData?.items ?? []).map((r) => [r.code, labels.roleName(r)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rolesData],
  );

  const handleEdit = async (user: UserListItem) => {
    try {
      const detail = await fetchUser(user.id);
      setModalUser(detail);
    } catch {
      show('error', t('common.error.unexpected'));
    }
  };

  const handleDelete = async (user: UserListItem) => {
    if (
      !confirm(
        t(
          'user-management.confirm.delete',
          { fullName: user.fullName, email: user.email },
          `${user.fullName} (${user.email}) kullanıcısını silmek istediğinize emin misiniz?`,
        ),
      )
    )
      return;
    try {
      await patchUser.mutateAsync({ id: user.id, isActive: false });
      show('success', t('user-management.toast.userDeleted', undefined, 'Kullanıcı silindi'));
      refetch();
    } catch (err) {
      show('error', err instanceof ApiError ? t(err.message) : t('common.error.unexpected'));
    }
  };

  const handleResetPassword = (user: UserListItem) => {
    setResetPasswordUser(user);
  };

  const columns = useMemo(
    () =>
      buildUserColumns(t, roleNameByCode, {
        onEdit: (user) => void handleEdit(user),
        onDelete: (user) => void handleDelete(user),
        onResetPassword: handleResetPassword,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, roleNameByCode],
  );

  const grid = useDataGridState<UserListItem>({ columns, defaultSort: { field: 'lastLoginAt', dir: 'desc' } });

  const query = useMemo(
    () => ({
      page: grid.page,
      pageSize: grid.pageSize,
      sort: `${grid.sort.field}:${grid.sort.dir}`,
      ...(grid.queryFilters as { q?: string; email?: string; roles?: string[]; lastLoginAtFrom?: string; lastLoginAtTo?: string }),
    }),
    [grid.page, grid.pageSize, grid.sort, grid.queryFilters],
  );

  const { data, isLoading, isFetching, refetch } = useUsers(query);

  return (
    <div className={styles.wrap}>
      <DataGrid<UserListItem>
        columns={columns}
        data={data?.items ?? []}
        page={data?.page ?? grid.page}
        pageSize={data?.pageSize ?? grid.pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        sort={grid.sort}
        onSortChange={grid.onSortChange}
        onPageChange={grid.onPageChange}
        onPageSizeChange={grid.onPageSizeChange}
        onRefresh={() => void refetch()}
        filterValues={grid.filterValues}
        onFilterChange={grid.onFilterChange}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyMessage={t('user-management.table.empty', undefined, 'Kullanıcı kaydı bulunamadı')}
        toolbarActions={
          <button type="button" onClick={() => setModalUser('create')} className="btn btn--primary">
            <FiPlus /> {t('user-management.action.new', undefined, 'Yeni Kullanıcı')}
          </button>
        }
      />

      {modalUser !== null && (
        <UserFormModal
          user={modalUser === 'create' ? undefined : modalUser}
          roles={rolesData?.items ?? []}
          onClose={() => setModalUser(null)}
        />
      )}

      {resetPasswordUser !== null && (
        <ResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
        />
      )}
    </div>
  );
}
