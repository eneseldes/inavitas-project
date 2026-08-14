import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { clsx } from 'clsx';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { z } from 'zod';
import { ApiError } from '../../../shared/api/errors.ts';
import { Modal } from '../../../shared/components/Modal.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { PasswordField, TextField } from '../../../shared/components/form';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import { useLabels } from '../../i18n/useLabels.ts';
import type { RoleListItem, UserDetail } from '../../../types/user-management.ts';
import { useCreateUser, usePatchUser, useSetUserRoles } from './useUsers.ts';
import styles from './UserFormModal.module.scss';

interface UserFormModalProps {
  user?: UserDetail;
  roles: RoleListItem[];
  onClose: () => void;
}

function useUserFormSchema(
  isEdit: boolean,
  messages: { email: string; fullName: string; password: string; rolesRequired: string },
) {
  return z
    .object({
      email: z.string().email(messages.email),
      fullName: z.string().min(1, messages.fullName),
      password: z.string().optional(),
      roles: z.array(z.object({ code: z.string() })).min(1, messages.rolesRequired),
    })
    .refine((data) => isEdit || (data.password && data.password.length >= 8), {
      message: messages.password,
      path: ['password'],
    });
}

export function UserFormModal({ user, roles, onClose }: UserFormModalProps) {
  const isEdit = user !== undefined;
  const { show } = useToast();
  const { t } = useTranslation();
  const labels = useLabels();

  const createUser = useCreateUser();
  const patchUser = usePatchUser();
  const setUserRoles = useSetUserRoles();

  const initialRoles = useMemo(() => user?.roles ?? [], [user?.roles]);
  // Yeni kullanıcı formu rolsüz açılır — admin ihtiyaç duyduğu rolü elle ekler.
  const defaultRoleCodes = isEdit ? initialRoles : [];

  const schema = useUserFormSchema(isEdit, {
    email: t('user-management.validation.emailInvalid', undefined, 'Geçerli bir e-posta girin'),
    fullName: t('user-management.validation.fullNameRequired', undefined, 'Ad soyad zorunludur'),
    password: t('user-management.validation.passwordMin', undefined, 'Parola en az 8 karakter olmalı'),
    rolesRequired: t('user-management.validation.rolesRequired', undefined, 'En az bir rol seçilmeli'),
  });

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: {
      email: user?.email ?? '',
      fullName: user?.fullName ?? '',
      password: '',
      roles: defaultRoleCodes.map((code) => ({ code })),
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'roles' });
  const watchedRoles = useWatch({ control, name: 'roles' }) ?? [];

  const handleAddRoleRow = () => {
    const usedCodes = watchedRoles.map((r) => r.code);
    const unused = roles.find((r) => !usedCodes.includes(r.code))?.code ?? roles[0]?.code;
    if (unused) append({ code: unused });
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const roleCodes = values.roles.map((r) => r.code);
      if (isEdit) {
        await patchUser.mutateAsync({ id: user.id, email: values.email, fullName: values.fullName });
        await setUserRoles.mutateAsync({ id: user.id, roleCodes });
        show('success', t('user-management.toast.updateSuccess', undefined, 'Kullanıcı güncellendi'));
      } else {
        await createUser.mutateAsync({ email: values.email, fullName: values.fullName, password: values.password ?? '', roleCodes });
        show('success', t('user-management.toast.createSuccess', undefined, 'Kullanıcı oluşturuldu'));
      }
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('common.error.unexpected') });
    }
  });

  return (
    <Modal
      title={isEdit ? t('user-management.dialog.edit.title', undefined, 'Kullanıcı Düzenle') : t('user-management.dialog.create.title', undefined, 'Yeni Kullanıcı')}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        {/* Side-by-side Email & FullName */}
        <div className={styles.twoColumn}>
          <TextField
            label={t('user-management.field.email', undefined, 'E-posta')}
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <TextField
            label={t('user-management.field.fullName', undefined, 'Ad Soyad')}
            error={errors.fullName?.message}
            {...register('fullName')}
          />
        </div>

        {!isEdit && (
          <PasswordField
            label={t('user-management.field.password', undefined, 'Parola')}
            hint={t('user-management.field.passwordHint', undefined, 'En az 8 karakter')}
            error={errors.password?.message}
            {...register('password')}
          />
        )}

        {/* Dynamic Role Select Rows */}
        <div className="field">
          <span className={styles.rolesHeading}>{t('user-management.field.roles', undefined, 'Roller')}</span>

          {fields.length > 0 && (
            <div className={styles.rolesList}>
              {fields.map((field, idx) => (
                <div key={field.id} className={styles.roleRow}>
                  <select className={clsx('select', styles.roleSelect)} {...register(`roles.${idx}.code` as const)}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.code}>
                        {labels.roleName(r)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="icon-btn" onClick={() => remove(idx)} title={t('common.action.delete', undefined, 'Sil')}>
                    <FiTrash2 />
                  </button>
                </div>
              ))}
            </div>
          )}

          {errors.roles?.root?.message && <p className="field__error">{errors.roles.root.message}</p>}

          <button type="button" className={clsx('btn', 'btn--ghost', styles.addRoleBtn)} onClick={handleAddRoleRow} title={t('user-management.field.addRole', undefined, 'Yeni rol alanı ekle')}>
            <FiPlus /> {t('common.action.add', undefined, 'Ekle')}
          </button>
        </div>

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel', undefined, 'İptal')}
          </button>
          <button type="submit" disabled={isSubmitting || (isEdit && !isDirty)} className="btn btn--primary">
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
