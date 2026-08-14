import { zodResolver } from '@hookform/resolvers/zod';
import { clsx } from 'clsx';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../../shared/api/errors.ts';
import { Modal } from '../../../shared/components/Modal.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { PasswordField } from '../../../shared/components/form';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { UserListItem } from '../../../types/user-management.ts';
import styles from './ResetPasswordModal.module.scss';
import { useResetPassword } from './useUsers.ts';

interface ResetPasswordModalProps {
  user: UserListItem;
  onClose: () => void;
}

function useResetPasswordSchema(minMessage: string) {
  return z.object({
    password: z.string().min(8, minMessage),
  });
}

export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const { show } = useToast();
  const { t } = useTranslation();
  const resetPassword = useResetPassword();
  const schema = useResetPasswordSchema(t('user-management.validation.passwordMin', undefined, 'Parola en az 8 karakter olmalı'));

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: { password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await resetPassword.mutateAsync({ id: user.id, password: values.password });
      show('success', t('user-management.toast.passwordResetSuccess', undefined, 'Parola başarıyla sıfırlandı'));
      onClose();
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('common.error.unexpected') });
    }
  });

  return (
    <Modal title={t('user-management.field.resetPassword', undefined, 'Parola Sıfırla')} onClose={onClose} size="md">
      <form onSubmit={onSubmit} noValidate>
        {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

        <p className={clsx('text-muted', styles.description)}>
          <strong>{user.fullName}</strong> ({user.email}) {t('user-management.field.resetPasswordDescription', undefined, 'kullanıcısı için yeni bir parola belirleyin.')}
        </p>

        <PasswordField
          label={t('user-management.field.password', undefined, 'Yeni Parola')}
          hint={t('user-management.field.passwordHint', undefined, 'En az 8 karakter')}
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel', undefined, 'İptal')}
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn--primary">
            {isSubmitting ? t('common.action.saving', undefined, 'Kaydediliyor…') : t('common.action.save', undefined, 'Kaydet')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
