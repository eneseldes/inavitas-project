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
import { ROOT_UNIT_PATH, type RoleListItem, type UserDetail } from '../../../types/user-management.ts';
import { UnitPicker } from '../units/UnitPicker.tsx';
import { useCreateUser, usePatchUser, useSetUserAssignments } from './useUsers.ts';
import styles from './UserFormModal.module.scss';

interface UserFormModalProps {
  user?: UserDetail;
  roles: RoleListItem[];
  onClose: () => void;
}

function useUserFormSchema(
  isEdit: boolean,
  messages: { email: string; fullName: string; password: string; assignmentsRequired: string; duplicate: string },
) {
  return z
    .object({
      email: z.string().email(messages.email),
      fullName: z.string().min(1, messages.fullName),
      password: z.string().optional(),
      assignments: z
        .array(z.object({ unitPath: z.string().min(1), roleCode: z.string().min(1) }))
        .min(1, messages.assignmentsRequired)
        // Benzersizlik artık rolün kendisi değil **(birim, rol) çifti** üzerinden: aynı rol
        // farklı birimlerde verilebilir, aynı çift iki kez verilemez.
        .refine(
          (rows) => new Set(rows.map((r) => `${r.unitPath}|${r.roleCode}`)).size === rows.length,
          messages.duplicate,
        ),
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
  const setUserAssignments = useSetUserAssignments();

  // Yeni kullanıcı formu yetkisiz açılır — yönetici ihtiyaç duyduğu satırı elle ekler.
  const defaultAssignments = useMemo(
    () => (user?.assignments ?? []).map((a) => ({ unitPath: a.unitPath, roleCode: a.roleCode })),
    [user?.assignments],
  );

  /** Seçili birimin adı: düzenleme modunda sunucudan gelir, yeni satırda ham yol yazılır. */
  const unitNameByPath = useMemo(
    () => new Map((user?.assignments ?? []).map((a) => [a.unitPath, a.unitName])),
    [user?.assignments],
  );

  const schema = useUserFormSchema(isEdit, {
    email: t('user-management.validation.emailInvalid'),
    fullName: t('user-management.validation.fullNameRequired'),
    password: t('user-management.validation.passwordMin'),
    assignmentsRequired: t('user-management.validation.assignmentsRequired'),
    duplicate: t('user-management.validation.assignmentDuplicate'),
  });

  const {
    register,
    control,
    setValue,
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
      assignments: defaultAssignments,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'assignments' });
  const watched = useWatch({ control, name: 'assignments' }) ?? [];

  /** Kullanılmamış bir (birim, rol) çifti önerir; varsayılan birim köktür. */
  const handleAddRow = () => {
    const used = new Set(watched.map((a) => `${a.unitPath}|${a.roleCode}`));
    const unusedRole = roles.find((r) => !used.has(`${ROOT_UNIT_PATH}|${r.code}`)) ?? roles[0];
    if (unusedRole) append({ unitPath: ROOT_UNIT_PATH, roleCode: unusedRole.code });
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await patchUser.mutateAsync({ id: user.id, email: values.email, fullName: values.fullName });
        await setUserAssignments.mutateAsync({ id: user.id, assignments: values.assignments });
        show('success', t('user-management.toast.updateSuccess'));
      } else {
        await createUser.mutateAsync({
          email: values.email,
          fullName: values.fullName,
          password: values.password ?? '',
          assignments: values.assignments,
        });
        show('success', t('user-management.toast.createSuccess'));
      }
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('common.error.unexpected') });
    }
  });

  return (
    <Modal
      title={isEdit ? t('user-management.dialog.edit.title') : t('user-management.dialog.create.title')}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <div className={styles.twoColumn}>
          <TextField
            label={t('user-management.field.email')}
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <TextField
            label={t('user-management.field.fullName')}
            error={errors.fullName?.message}
            {...register('fullName')}
          />
        </div>

        {!isEdit && (
          <PasswordField
            label={t('user-management.field.password')}
            hint={t('user-management.field.passwordHint')}
            error={errors.password?.message}
            {...register('password')}
          />
        )}

        {/* Her satır bir (birim, rol) çiftidir — yetki artık "nerede" sorusunu da cevaplar. */}
        <div className="field">
          <span className={styles.rolesHeading}>{t('user-management.field.roles')}</span>

          {fields.length > 0 && (
            <div className={styles.rolesList}>
              <div className={styles.assignmentHead}>
                <span>{t('user-management.field.unit')}</span>
                <span>{t('user-management.field.role')}</span>
                <span />
              </div>
              {fields.map((field, idx) => {
                const unitPath = watched[idx]?.unitPath ?? field.unitPath;
                return (
                  <div key={field.id} className={styles.assignmentRow}>
                    <UnitPicker
                      value={unitPath}
                      valueLabel={unitNameByPath.get(unitPath) ?? undefined}
                      onChange={(next) => setValue(`assignments.${idx}.unitPath`, next, { shouldDirty: true })}
                    />
                    <select className={clsx('select', styles.roleSelect)} {...register(`assignments.${idx}.roleCode` as const)}>
                      {roles.map((r) => (
                        <option key={r.id} value={r.code}>
                          {labels.roleName(r)}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="icon-btn" onClick={() => remove(idx)} title={t('common.action.delete')}>
                      <FiTrash2 />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {errors.assignments?.root?.message && <p className="field__error">{errors.assignments.root.message}</p>}

          <button
            type="button"
            className={clsx('btn', 'btn--ghost', styles.addRoleBtn)}
            onClick={handleAddRow}
            title={t('user-management.field.addRole')}
          >
            <FiPlus /> {t('common.action.add')}
          </button>
        </div>

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel')}
          </button>
          <button type="submit" disabled={isSubmitting || (isEdit && !isDirty)} className="btn btn--primary">
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
