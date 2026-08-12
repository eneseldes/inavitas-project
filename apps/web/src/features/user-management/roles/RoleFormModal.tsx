import { useState } from 'react';
import { ApiError } from '../../../shared/api/errors.ts';
import { Modal } from '../../../shared/components/Modal.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { RoleListItem } from '../../../types/user-management.ts';
import { useCreateRole, usePatchRole } from './useRoles.ts';

interface RoleFormModalProps {
  role?: RoleListItem;
  onClose: () => void;
}

export function RoleFormModal({ role, onClose }: RoleFormModalProps) {
  const isEdit = role !== undefined;
  const { show } = useToast();
  const { t } = useTranslation();

  const createRole = useCreateRole();
  const patchRole = usePatchRole();

  const initialName = role?.name ?? '';
  const [name, setName] = useState(initialName);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = name.trim() !== '' && name !== initialName;

  const handleSubmit = async () => {
    if (!isDirty) return;
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await patchRole.mutateAsync({ id: role.id, name });
        show('success', t('user-management.role.toast.updateSuccess', undefined, 'Rol güncellendi'));
      } else {
        await createRole.mutateAsync({ name, permissionCodes: [] });
        show('success', t('user-management.role.toast.createSuccess', undefined, 'Rol oluşturuldu'));
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
      title={isEdit ? 'Rol Adını Düzenle' : 'Yeni Rol'}
      onClose={onClose}
      size="md"
    >
      {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="rf-name" className="field__label">
          {t('user-management.role.field.name', undefined, 'Rol Adı')}
        </label>
        <input
          id="rf-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn: Kesinti İzleyici"
          disabled={role?.isSystem}
        />
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn btn--ghost">
          {t('common.action.cancel', undefined, 'İptal')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isDirty || isSubmitting || role?.isSystem}
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
