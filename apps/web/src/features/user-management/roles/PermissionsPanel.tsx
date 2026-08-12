import { useEffect, useMemo, useState } from 'react';
import { FiCheck, FiChevronRight, FiLock } from 'react-icons/fi';
import { clsx } from 'clsx';
import { ApiError } from '../../../shared/api/errors.ts';
import { useToast } from '../../../shared/components/Toast.tsx';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { PermissionItem } from '../../../types/user-management.ts';
import { useRole, useSetRolePermissions } from './useRoles.ts';
import styles from './PermissionsPanel.module.scss';

const MODULE_LABELS: Record<string, string> = {
  outage: 'Kesinti Yönetimi',
  workorder: 'İş Emri Yönetimi',
  user: 'Kullanıcı & Rol Yönetimi',
  translation: 'Çeviri Yönetimi',
};

interface PermissionsPanelProps {
  roleId: string | null;
  permissions: PermissionItem[];
}

export function PermissionsPanel({ roleId, permissions }: PermissionsPanelProps) {
  const { t } = useTranslation();
  const { show } = useToast();

  const { data: roleDetail, isLoading: isRoleLoading } = useRole(roleId ?? undefined);
  const setRolePermissions = useSetRolePermissions();

  const [checkedPerms, setCheckedPerms] = useState<Set<string>>(new Set());
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [isSubmitting, setSubmitting] = useState(false);

  // Sync checkedPerms when roleDetail loads or roleId changes
  useEffect(() => {
    if (roleDetail) {
      setCheckedPerms(new Set(roleDetail.permissionCodes));
    } else {
      setCheckedPerms(new Set());
    }
  }, [roleDetail]);

  const initialSet = useMemo(() => new Set(roleDetail?.permissionCodes ?? []), [roleDetail]);

  // Dirty state tracking
  const isDirty = useMemo(() => {
    if (!roleDetail || roleDetail.isSystem) return false;
    if (checkedPerms.size !== initialSet.size) return true;
    for (const code of checkedPerms) {
      if (!initialSet.has(code)) return true;
    }
    return false;
  }, [checkedPerms, initialSet, roleDetail]);

  // Group permissions by module prefix
  const groupedModules = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const perm of permissions) {
      const prefix = perm.code.split(':')[0] ?? 'diğer';
      const list = map.get(prefix) ?? [];
      list.push(perm);
      map.set(prefix, list);
    }
    return map;
  }, [permissions]);

  const toggleModuleOpen = (prefix: string) => {
    setOpenModules((prev) => ({ ...prev, [prefix]: !prev[prefix] }));
  };

  const togglePerm = (code: string) => {
    if (roleDetail?.isSystem) return;
    setCheckedPerms((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const toggleModuleAll = (modulePerms: PermissionItem[], e: React.MouseEvent) => {
    e.stopPropagation();
    if (roleDetail?.isSystem) return;
    const allChecked = modulePerms.every((p) => checkedPerms.has(p.code));
    setCheckedPerms((prev) => {
      const next = new Set(prev);
      for (const p of modulePerms) {
        if (allChecked) {
          next.delete(p.code);
        } else {
          next.add(p.code);
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!roleId || !isDirty) return;
    setSubmitting(true);
    try {
      await setRolePermissions.mutateAsync({
        id: roleId,
        permissionCodes: Array.from(checkedPerms),
      });
      show('success', t('user-management.role.toast.updateSuccess', undefined, 'Rol izinleri güncellendi'));
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
          <p>İzinlerini düzenlemek için soldaki tablodan bir rol seçin.</p>
        </div>
      </div>
    );
  }

  if (isRoleLoading) {
    return (
      <div className={styles.panel}>
        <p className="text-muted" style={{ padding: '16px' }}>{t('common.loading', undefined, 'Yükleniyor…')}</p>
      </div>
    );
  }

  const isReadOnly = roleDetail?.isSystem ?? false;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h3 className={styles.title}>{roleDetail?.name} İzinleri</h3>
          {isReadOnly && (
            <span className="badge badge--gray" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <FiLock size={12} /> Sistem Rolü
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!isDirty || isSubmitting || isReadOnly}
          onClick={handleSave}
        >
          {isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>

      {isReadOnly && (
        <div className={styles.systemBanner}>
          <FiLock style={{ flexShrink: 0 }} /> Sistem rolleri varsayılan izinlere sahiptir, yetkileri değiştirilemez.
        </div>
      )}

      <div className={styles.body}>
        {Array.from(groupedModules.entries()).map(([prefix, perms]) => {
          const moduleTitle = MODULE_LABELS[prefix] ?? `${prefix.toUpperCase()} Modülü`;
          const checkedCount = perms.filter((p) => checkedPerms.has(p.code)).length;
          const allChecked = perms.length > 0 && checkedCount === perms.length;
          const isOpen = openModules[prefix] ?? false;

          return (
            <div key={prefix} className={styles.moduleSection}>
              {/* Accordion Module Header */}
              <div
                className={styles.moduleHeader}
                onClick={() => toggleModuleOpen(prefix)}
                role="button"
                tabIndex={0}
              >
                <button
                  type="button"
                  className={clsx(styles.chevronBtn, isOpen && styles.chevronBtnOpen)}
                  tabIndex={-1}
                >
                  <FiChevronRight />
                </button>

                <label
                  className={styles.checkbox}
                  onClick={(e) => toggleModuleAll(perms, e)}
                  title="Tümünü seç"
                >
                  <input
                    type="checkbox"
                    checked={allChecked}
                    disabled={isReadOnly}
                    onChange={() => {}}
                  />
                  <span className={styles.checkboxBox}>
                    <FiCheck />
                  </span>
                </label>

                <span className={styles.moduleTitle}>{moduleTitle}</span>
              </div>

              {/* Collapsible Module Items */}
              <div className={clsx(styles.permListWrapper, isOpen && styles.permListWrapperOpen)}>
                <div className={styles.permListInner}>
                  <div className={styles.permList}>
                    {perms.map((perm) => {
                      const labelText = perm.description || perm.code;
                      const isChecked = checkedPerms.has(perm.code);

                      return (
                        <label
                          key={perm.code}
                          className={styles.permRow}
                          title={perm.code}
                        >
                          <span className={styles.checkbox}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isReadOnly}
                              onChange={() => togglePerm(perm.code)}
                            />
                            <span className={styles.checkboxBox}>
                              <FiCheck />
                            </span>
                          </span>
                          <span className={styles.permLabel}>{labelText}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
