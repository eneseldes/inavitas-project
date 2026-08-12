import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { ApiError } from '../../../shared/api/errors.ts';
import { Modal } from '../../../shared/components/Modal.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { RoleListItem, UserDetail } from '../../../types/user-management.ts';
import { useCreateUser, usePatchUser, useSetUserRoles } from './useUsers.ts';
import styles from './UserFormModal.module.scss';

interface UserFormModalProps {
  user?: UserDetail;
  roles: RoleListItem[];
  onClose: () => void;
}

function sameRoles(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

export function UserFormModal({ user, roles, onClose }: UserFormModalProps) {
  const isEdit = user !== undefined;
  const { show } = useToast();
  const { t } = useTranslation();

  const createUser = useCreateUser();
  const patchUser = usePatchUser();
  const setUserRoles = useSetUserRoles();

  const initialEmail = user?.email ?? '';
  const initialFullName = user?.fullName ?? '';
  const initialRoles = useMemo(() => user?.roles ?? [], [user?.roles]);

  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState(initialFullName);
  const [password, setPassword] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    initialRoles.length > 0 ? [...initialRoles] : roles.length > 0 ? [roles[0].code] : [],
  );

  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dirty state tracking
  const isDirty = isEdit
    ? email !== initialEmail || fullName !== initialFullName || !sameRoles(selectedRoles, initialRoles)
    : email.trim() !== '' && fullName.trim() !== '' && password.length >= 8 && selectedRoles.length > 0;

  const handleAddRoleRow = () => {
    const unused = roles.find((r) => !selectedRoles.includes(r.code))?.code ?? roles[0]?.code;
    if (unused) {
      setSelectedRoles((prev) => [...prev, unused]);
    }
  };

  const handleRoleChange = (index: number, newCode: string) => {
    setSelectedRoles((prev) => {
      const next = [...prev];
      next[index] = newCode;
      return next;
    });
  };

  const handleRemoveRoleRow = (index: number) => {
    setSelectedRoles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await patchUser.mutateAsync({ id: user.id, email, fullName });
        await setUserRoles.mutateAsync({ id: user.id, roleCodes: selectedRoles });
        show('success', t('user-management.toast.updateSuccess', undefined, 'Kullanıcı güncellendi'));
      } else {
        await createUser.mutateAsync({ email, fullName, password, roleCodes: selectedRoles });
        show('success', t('user-management.toast.createSuccess', undefined, 'Kullanıcı oluşturuldu'));
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t('common.error.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={isEdit ? t('user-management.dialog.edit.title', undefined, 'Kullanıcı Düzenle') : t('user-management.dialog.create.title', undefined, 'Yeni Kullanıcı')}
      onClose={onClose}
      size="lg"
    >
      {error && <div className="form-error-banner">{error}</div>}

      {/* Side-by-side Email & FullName */}
      <div className={styles.twoColumn}>
        <div className="field">
          <label htmlFor="um-email" className="field__label">
            {t('user-management.field.email', undefined, 'E-posta')}
          </label>
          <input
            id="um-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="um-fullName" className="field__label">
            {t('user-management.field.fullName', undefined, 'Ad Soyad')}
          </label>
          <input
            id="um-fullName"
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
      </div>

      {!isEdit && (
        <div className="field">
          <label htmlFor="um-password" className="field__label">
            {t('user-management.field.password', undefined, 'Parola')}
          </label>
          <input
            id="um-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}

      {/* Dynamic Role Select Rows */}
      <div className="field">
        <span className="field__label">{t('user-management.field.roles', undefined, 'Roller')}</span>

        <div className={styles.rolesList}>
          {selectedRoles.map((roleCode, idx) => (
            <div key={idx} className={styles.roleRow}>
              <select
                className="select"
                value={roleCode}
                onChange={(e) => handleRoleChange(idx, e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn"
                onClick={() => handleRemoveRoleRow(idx)}
                title="Sil"
              >
                <FiTrash2 />
              </button>
            </div>
          ))}

          {selectedRoles.length === 0 && (
            <p className="text-muted" style={{ fontSize: '0.875rem' }}>
              Henüz rol seçilmedi. Aşağıdaki butona basarak ekleyebilirsiniz.
            </p>
          )}
        </div>

        <button
          type="button"
          className={clsx('btn', 'btn--ghost', styles.addRoleBtn)}
          onClick={handleAddRoleRow}
          title="Yeni rol alanı ekle"
        >
          <FiPlus /> Ekle
        </button>
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn btn--ghost">
          {t('common.action.cancel', undefined, 'İptal')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isDirty || isSubmitting}
          className="btn btn--primary"
        >
          {isSubmitting
            ? t('common.action.saving', undefined, 'Kaydediliyor…')
            : isEdit
            ? t('common.action.save', undefined, 'Kaydet')
            : t('common.action.create', undefined, 'Oluştur')}
        </button>
      </div>
    </Modal>
  );
}
