import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../../shared/api/errors.ts';
import { Modal } from '../../../shared/components/Modal.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { TextField } from '../../../shared/components/form';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { RoleListItem } from '../../../types/user-management.ts';
import { useCreateRole, usePatchRole } from './useRoles.ts';

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
  const schema = useRoleFormSchema(t('user-management.role.validation.nameRequired', undefined, 'Rol adı zorunludur'));

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
        show('success', t('user-management.role.toast.updateSuccess', undefined, 'Rol güncellendi'));
      } else {
        await createRole.mutateAsync({ name: values.name, permissionCodes: [] });
        show('success', t('user-management.role.toast.createSuccess', undefined, 'Rol oluşturuldu'));
      }
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('common.error.unexpected') });
    }
  });

  return (
    <Modal
      title={isEdit ? t('user-management.role.dialog.edit.title', undefined, 'Rol Düzenle') : t('user-management.role.dialog.create.title', undefined, 'Yeni Rol')}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <TextField
          label={t('user-management.role.field.name', undefined, 'Rol Adı')}
          disabled={role?.isSystem}
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel', undefined, 'İptal')}
          </button>
          <button type="submit" disabled={isSubmitting || role?.isSystem || (isEdit && !isDirty)} className="btn btn--primary">
            {isSubmitting
              ? t('common.action.saving', undefined, 'Kaydediliyor…')
              : isEdit
              ? t('common.action.save', undefined, 'Kaydet')
              : t('common.action.create', undefined, 'Oluştur')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
