import { useState } from 'react';
import { ApiError } from '../../../shared/api/errors.ts';
import { Modal } from '../../../shared/components/Modal.tsx';
import { useToast } from '../../../shared/components/Toast.tsx';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import type { UserListItem } from '../../../types/user-management.ts';
import { useResetPassword } from './useUsers.ts';

interface ResetPasswordModalProps {
  user: UserListItem;
  onClose: () => void;
}

export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const { show } = useToast();
  const { t } = useTranslation();
  const resetPassword = useResetPassword();

  const [password, setPassword] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = password.length >= 8;

  const handleSubmit = async () => {
    if (!isValid) return;
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword.mutateAsync({ id: user.id, password });
      show('success', t('user-management.toast.passwordResetSuccess', undefined, 'Parola başarıyla sıfırlandı'));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t('common.error.unexpected'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('user-management.field.resetPassword', undefined, 'Parola Sıfırla')}
      onClose={onClose}
      size="md"
    >
      {error && <div className="form-error-banner">{error}</div>}

      <div style={{ marginBottom: '16px' }}>
        <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          <strong>{user.fullName}</strong> ({user.email}) kullanıcısı için yeni bir parola belirleyin.
        </p>
      </div>

      <div className="field">
        <label htmlFor="rpm-password" className="field__label">
          {t('user-management.field.password', undefined, 'Yeni Parola')}
        </label>
        <input
          id="rpm-password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="En az 8 karakter"
        />
      </div>

      <div className="form-actions">
        <button type="button" onClick={onClose} className="btn btn--ghost">
          {t('common.action.cancel', undefined, 'İptal')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="btn btn--primary"
        >
          {isSubmitting
            ? t('common.action.saving', undefined, 'Kaydediliyor…')
            : t('common.action.save', undefined, 'Kaydet')}
        </button>
      </div>
    </Modal>
  );
}
