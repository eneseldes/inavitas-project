import { useMemo, useState } from 'react';
import { FiEdit2, FiPlus, FiTrash2 } from 'react-icons/fi';
import type { ColumnDef } from '@tanstack/react-table';
import { DataGrid, type ColumnMeta } from '../../../shared/components/DataGrid.tsx';
import { ApiError } from '../../../shared/api/errors.ts';
import { useToast } from '../../../shared/components/Toast.tsx';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { SortDirection } from '../../../types/api.ts';
import type { RoleListItem } from '../../../types/user-management.ts';
import { PermissionsPanel } from './PermissionsPanel.tsx';
import { RoleFormModal } from './RoleFormModal.tsx';
import { useDeleteRole, usePermissions, useRoles } from './useRoles.ts';
import styles from './RolesView.module.scss';

/** Roller uçtan uca (sayfalamasız) çekilir — filtre/sıralama burada, tarayıcıda yapılır. */
export function RolesView() {
  const { t } = useTranslation();
  const { show } = useToast();

  const { data: rolesData, isLoading, refetch } = useRoles();
  const { data: permsData } = usePermissions();
  const deleteRole = useDeleteRole();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [modalRole, setModalRole] = useState<RoleListItem | null | 'create'>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [sort, setSort] = useState<{ field: string; dir: SortDirection }>({ field: 'name', dir: 'asc' });

  const handleDelete = async (role: RoleListItem) => {
    if (role.isSystem) return;
    if (role.userCount > 0) {
      show('error', t('user-management.role.delete.hasUsers', undefined, 'Önce bu roldeki kullanıcıları başka role taşıyın'));
      return;
    }
    if (!confirm(`${role.name} rolünü silmek istediğinize emin misiniz?`)) return;

    try {
      await deleteRole.mutateAsync(role.id);
      show('success', t('user-management.role.toast.deleteSuccess', undefined, 'Rol silindi'));
      if (selectedRoleId === role.id) setSelectedRoleId(null);
      refetch();
    } catch (err) {
      show('error', err instanceof ApiError ? t(err.message) : t('common.error.unexpected'));
    }
  };

  const roles = useMemo(() => rolesData?.items ?? [], [rolesData]);
  const permissions = permsData?.items ?? [];

  const filteredSortedRoles = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    const filtered = q ? roles.filter((r) => r.name.toLowerCase().includes(q)) : roles;

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const field = sort.field as 'name' | 'userCount' | 'permissionCount';
      const av = a[field];
      const bv = b[field];
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return 0;
    });
  }, [roles, nameFilter, sort]);

  // Default selection to first role if available and none selected
  const activeSelectedRoleId = selectedRoleId ?? (roles.length > 0 ? roles[0].id : null);

  const columns: ColumnDef<RoleListItem>[] = useMemo(
    () => [
      {
        id: 'name',
        header: t('user-management.role.column.name', undefined, 'Rol Adı'),
        accessorFn: (row) => row.name,
        cell: (ctx) => {
          const role = ctx.row.original;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 500 }}>{role.name}</span>
              {role.isSystem && (
                <span className="badge badge--gray">Sistem</span>
              )}
            </div>
          );
        },
        meta: {
          sortField: 'name',
          filter: {
            key: 'name',
            type: 'text',
            placeholder: t('user-management.role.filter.namePlaceholder', undefined, 'Rol adı ara…'),
            // Filtre/sıralama sunucuya değil, doğrudan tarayıcıdaki listeye uygulanır (bkz. filteredSortedRoles).
            toQuery: () => ({}),
          },
        } satisfies ColumnMeta,
      },
      {
        id: 'userCount',
        header: t('user-management.role.column.users', undefined, 'Kullanıcı'),
        accessorFn: (row) => row.userCount,
        cell: (ctx) => <span className="text-muted">{ctx.getValue<number>()}</span>,
        meta: { sortField: 'userCount' } satisfies ColumnMeta,
      },
      {
        id: 'permissionCount',
        header: t('user-management.role.column.permissions', undefined, 'İzin'),
        accessorFn: (row) => row.permissionCount,
        cell: (ctx) => <span className="text-muted">{ctx.getValue<number>()}</span>,
        meta: { sortField: 'permissionCount' } satisfies ColumnMeta,
      },
      {
        id: 'actions',
        header: 'İşlemler',
        cell: (ctx) => {
          const role = ctx.row.original;
          return (
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                title="Rol Adını Düzenle"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalRole(role);
                }}
              >
                <FiEdit2 />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                title={
                  role.isSystem
                    ? 'Sistem rolleri silinemez'
                    : role.userCount > 0
                    ? 'Kullanıcısı olan rol silinemez'
                    : 'Sil'
                }
                disabled={role.isSystem || role.userCount > 0}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(role);
                }}
              >
                <FiTrash2 />
              </button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  return (
    <div className={styles.splitLayout}>
      {/* Left side: DataGrid Table */}
      <div className={styles.leftGrid}>
        <DataGrid<RoleListItem>
          columns={columns}
          data={filteredSortedRoles}
          page={1}
          pageSize={Math.max(100, filteredSortedRoles.length)}
          total={filteredSortedRoles.length}
          totalPages={1}
          sort={sort}
          onSortChange={setSort}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          onRefresh={() => void refetch()}
          filterValues={{ name: nameFilter }}
          onFilterChange={(key, value) => {
            if (key === 'name') setNameFilter(value as string);
          }}
          isLoading={isLoading}
          onRowClick={(role) => setSelectedRoleId(role.id)}
          isRowSelected={(role) => role.id === activeSelectedRoleId}
          emptyMessage={t('user-management.role.table.empty', undefined, 'Rol kaydı bulunamadı')}
          toolbarActions={
            <button type="button" onClick={() => setModalRole('create')} className="btn btn--primary">
              <FiPlus /> {t('user-management.role.action.new', undefined, 'Yeni Rol')}
            </button>
          }
        />
      </div>

      {/* Right side: 1/3 Permissions Panel */}
      <div className={styles.rightPanel}>
        <PermissionsPanel roleId={activeSelectedRoleId} permissions={permissions} />
      </div>

      {modalRole !== null && (
        <RoleFormModal
          role={modalRole === 'create' ? undefined : modalRole}
          onClose={() => setModalRole(null)}
        />
      )}
    </div>
  );
}
