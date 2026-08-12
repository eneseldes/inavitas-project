import { useMemo, useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import { DataGrid, type FilterValue } from '../../../shared/components/DataGrid.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { ApiError } from '../../../shared/api/errors.ts';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { SortDirection } from '../../../types/api.ts';
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
  const { show } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ field: string; dir: SortDirection }>({ field: 'lastLoginAt', dir: 'desc' });
  const [filterValues, setFilterValues] = useState<Record<string, FilterValue>>({ q: '' });

  const [modalUser, setModalUser] = useState<UserDetail | null | 'create'>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserListItem | null>(null);

  const { data, isLoading, isFetching, refetch } = useUsers({
    page,
    pageSize,
    sort: `${sort.field}:${sort.dir}`,
    q: (filterValues.q as string) || undefined,
  });
  const { data: rolesData } = useRoles();
  const patchUser = usePatchUser();

  const handleFilterChange = (field: string, value: FilterValue) => {
    setFilterValues((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const handleEdit = async (user: UserListItem) => {
    try {
      const detail = await fetchUser(user.id);
      setModalUser(detail);
    } catch {
      show('error', t('common.error.unexpected'));
    }
  };

  const handleDelete = async (user: UserListItem) => {
    if (!confirm(`${user.fullName} (${user.email}) kullanıcısını silmek istediğinize emin misiniz?`)) return;
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

  const roleNameByCode = useMemo(
    () => Object.fromEntries((rolesData?.items ?? []).map((r) => [r.code, r.name])),
    [rolesData],
  );

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

  return (
    <div className={styles.wrap}>
      <DataGrid<UserListItem>
        columns={columns}
        data={data?.items ?? []}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        sort={sort}
        onSortChange={(next) => { setSort(next); setPage(1); }}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        onRefresh={() => void refetch()}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
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
