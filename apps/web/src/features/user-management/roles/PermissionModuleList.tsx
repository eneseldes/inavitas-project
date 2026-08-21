import { useMemo, useState, type MouseEvent } from 'react';
import { FiCheck, FiChevronRight } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { PermissionItem } from '../../../types/user-management.ts';
import styles from './PermissionsPanel.module.scss';

interface PermissionModuleListProps {
  permissions: PermissionItem[];
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
  readOnly?: boolean;
}

/**
 * Modüllere göre gruplanmış izin listesi — hem rol izin paneli hem yeni rol modali bunu
 * kullanır; iki ayrı izin listesi yazılmaz.
 *
 * Gruplama izin kodunun önekinden **türetilmez**, iznin kendi `module` alanından gelir:
 * abone izinleri `customer:` ön ekini taşır ama Şebeke Yönetimi kutusunda görünür ve grup
 * başlığındaki "tümünü seç" onları da kapsar. Sıra da sunucudan (`sortOrder`) gelir.
 */
export function PermissionModuleList({ permissions, checked, onChange, readOnly }: PermissionModuleListProps) {
  const { t } = useTranslation();
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});

  const groupedModules = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const perm of [...permissions].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const list = map.get(perm.module) ?? [];
      list.push(perm);
      map.set(perm.module, list);
    }
    return map;
  }, [permissions]);

  const toggleModuleOpen = (module: string) => {
    setOpenModules((prev) => ({ ...prev, [module]: !prev[module] }));
  };

  const togglePerm = (code: string) => {
    if (readOnly) return;
    const next = new Set(checked);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  };

  const toggleModuleAll = (modulePerms: PermissionItem[], event: MouseEvent) => {
    event.stopPropagation();
    if (readOnly) return;

    const allChecked = modulePerms.every((p) => checked.has(p.code));
    const next = new Set(checked);
    for (const perm of modulePerms) {
      if (allChecked) next.delete(perm.code);
      else next.add(perm.code);
    }
    onChange(next);
  };

  return (
    <>
      {Array.from(groupedModules.entries()).map(([module, perms]) => {
        const allChecked = perms.length > 0 && perms.every((p) => checked.has(p.code));
        const isOpen = openModules[module] ?? false;

        return (
          <div key={module} className={styles.moduleSection}>
            <div className={styles.moduleHeader} onClick={() => toggleModuleOpen(module)} role="button" tabIndex={0}>
              <button type="button" className={clsx(styles.chevronBtn, isOpen && styles.chevronBtnOpen)} tabIndex={-1}>
                <FiChevronRight />
              </button>

              <label
                className={styles.checkbox}
                onClick={(e) => toggleModuleAll(perms, e)}
                title={t('common.action.selectAll')}
              >
                <input type="checkbox" checked={allChecked} disabled={readOnly} onChange={() => {}} />
                <span className={styles.checkboxBox}>
                  <FiCheck />
                </span>
              </label>

              <span className={styles.moduleTitle}>{t(`user-management.role.module.${module}`)}</span>
            </div>

            <div className={clsx(styles.permListWrapper, isOpen && styles.permListWrapperOpen)}>
              <div className={styles.permListInner}>
                <div className={styles.permList}>
                  {perms.map((perm) => (
                    <label key={perm.code} className={styles.permRow} title={perm.code}>
                      <span className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={checked.has(perm.code)}
                          disabled={readOnly}
                          onChange={() => togglePerm(perm.code)}
                        />
                        <span className={styles.checkboxBox}>
                          <FiCheck />
                        </span>
                      </span>
                      <span className={styles.permLabel}>
                        {t(
                          `user-management.permission.${perm.code.replace(':', '.')}`,
                          undefined,
                          perm.description ?? perm.code,
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
