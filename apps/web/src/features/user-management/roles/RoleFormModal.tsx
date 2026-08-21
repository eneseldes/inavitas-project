import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../../shared/api/errors.ts';
import { Modal } from '../../../shared/components/Modal.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { TextField } from '../../../shared/components/form';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { RoleListItem } from '../../../types/user-management.ts';
import { PermissionModuleList } from './PermissionModuleList.tsx';
import { useCreateRole, usePatchRole, usePermissions } from './useRoles.ts';
import styles from './RoleFormModal.module.scss';

interface RoleFormModalProps {
  role?: RoleListItem;
  onClose: () => void;
}

function useRoleFormSchema(requiredMessage: string) {
  return z.object({
    name: z.string().min(1, requiredMessage),
  });
}

export function RoleFormModal({ role, onClose }: RoleFormModalProps) {
  const isEdit = role !== undefined;
  const { show } = useToast();
  const { t } = useTranslation();

  const createRole = useCreateRole();
  const patchRole = usePatchRole();
  const { data: permsData } = usePermissions();
  const schema = useRoleFormSchema(t('user-management.role.validation.nameRequired'));

  // Yeni rol izinleri burada seçilir — panelin gruplu listesiyle AYNI bileşen kullanılır,
  // ikinci bir izin listesi yazılmaz. Düzenleme modunda izinler paneldedir.
  const [checkedPerms, setCheckedPerms] = useState<Set<string>>(new Set());

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: { name: role?.name ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await patchRole.mutateAsync({ id: role.id, name: values.name });
        show('success', t('user-management.role.toast.updateSuccess'));
      } else {
        await createRole.mutateAsync({ name: values.name, permissionCodes: Array.from(checkedPerms) });
        show('success', t('user-management.role.toast.createSuccess'));
      }
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('common.error.unexpected') });
    }
  });

  return (
    <Modal
      title={isEdit ? t('user-management.role.dialog.edit.title') : t('user-management.role.dialog.create.title')}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <TextField
          label={t('user-management.role.field.name')}
          disabled={role?.isSystem}
          error={errors.name?.message}
          {...register('name')}
        />

        {!isEdit && (
          <div className="field">
            <span className={styles.permissionsHeading}>{t('user-management.role.field.permissions')}</span>
            <div className={styles.permissionsList}>
              <PermissionModuleList
                permissions={permsData?.items ?? []}
                checked={checkedPerms}
                onChange={setCheckedPerms}
              />
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel')}
          </button>
          <button type="submit" disabled={isSubmitting || role?.isSystem || (isEdit && !isDirty)} className="btn btn--primary">
            {isSubmitting
              ? t('common.action.saving')
              : isEdit
                ? t('common.action.save')
                : t('common.action.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
