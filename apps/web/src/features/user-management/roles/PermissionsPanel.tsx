import { useEffect, useMemo, useState } from 'react';
import { FiLock } from 'react-icons/fi';
import { clsx } from 'clsx';
import { ApiError } from '../../../shared/api/errors.ts';
import { useToast } from '../../../shared/components/Toast.tsx';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import { useLabels } from '../../i18n/useLabels.ts';
import type { PermissionItem } from '../../../types/user-management.ts';
import { PermissionModuleList } from './PermissionModuleList.tsx';
import { useRole, useSetRolePermissions } from './useRoles.ts';
import styles from './PermissionsPanel.module.scss';

interface PermissionsPanelProps {
  roleId: string | null;
  permissions: PermissionItem[];
}

export function PermissionsPanel({ roleId, permissions }: PermissionsPanelProps) {
  const { t } = useTranslation();
  const labels = useLabels();
  const { show } = useToast();

  const { data: roleDetail, isLoading: isRoleLoading } = useRole(roleId ?? undefined);
  const setRolePermissions = useSetRolePermissions();

  const [checkedPerms, setCheckedPerms] = useState<Set<string>>(new Set());
  const [isSubmitting, setSubmitting] = useState(false);

  // Rol değiştiğinde (ya da detayı yüklendiğinde) işaretli küme sıfırlanır.
  useEffect(() => {
    setCheckedPerms(new Set(roleDetail?.permissionCodes ?? []));
  }, [roleDetail]);

  const initialSet = useMemo(() => new Set(roleDetail?.permissionCodes ?? []), [roleDetail]);

  const isDirty = useMemo(() => {
    if (!roleDetail || roleDetail.isSystem) return false;
    if (checkedPerms.size !== initialSet.size) return true;
    for (const code of checkedPerms) {
      if (!initialSet.has(code)) return true;
    }
    return false;
  }, [checkedPerms, initialSet, roleDetail]);

  const handleSave = async () => {
    if (!roleId || !isDirty) return;
    setSubmitting(true);
    try {
      await setRolePermissions.mutateAsync({ id: roleId, permissionCodes: Array.from(checkedPerms) });
      show('success', t('user-management.role.toast.updateSuccess'));
    } catch (err) {
      show('error', err instanceof ApiError ? t(err.message) : t('common.error.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!roleId) {
    return (
      <div className={styles.panel}>
        <div className={styles.emptyState}>
          <p>{t('user-management.role.permissionsPanel.emptyState')}</p>
        </div>
      </div>
    );
  }

  if (isRoleLoading) {
    return (
      <div className={styles.panel}>
        <p className={styles.emptyState}>{t('common.loading')}</p>
      </div>
    );
  }

  const isReadOnly = roleDetail?.isSystem ?? false;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h3 className={styles.title}>
            {t('user-management.role.permissionsTitle', { name: roleDetail ? labels.roleName(roleDetail) : '' })}
          </h3>
          {isReadOnly && (
            <span className={clsx('badge', 'badge--gray', styles.systemBadge)}>
              <FiLock size={12} /> {t('user-management.role.badge.system')}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!isDirty || isSubmitting || isReadOnly}
          onClick={handleSave}
        >
          {isSubmitting ? t('common.action.saving') : t('common.action.save')}
        </button>
      </div>

      {isReadOnly && (
        <div className={styles.systemBanner}>
          <FiLock className={styles.bannerIcon} /> {t('user-management.role.badge.systemNote')}
        </div>
      )}

      <div className={styles.body}>
        <PermissionModuleList
          permissions={permissions}
          checked={checkedPerms}
          onChange={setCheckedPerms}
          readOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
