import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiLock, FiLogIn, FiMail } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../../shared/api/errors.ts';
import styles from './LoginPage.module.scss';
import { useAuth } from './useAuth.tsx';

const LoginFormSchema = z.object({
  email: z.email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Parola zorunlu'),
});
type LoginFormValues = z.infer<typeof LoginFormSchema>;

/** Yetkisi olan ilk ekrana yönlendirir (FR-5.1). */
function firstAllowedRoute(permissions: string[]): string {
  if (permissions.includes('outage:read')) return '/outages';
  if (permissions.includes('workorder:read')) return '/work-orders';
  return '/403';
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(LoginFormSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await login(values.email, values.password);
      const redirectTo = (location.state as { from?: string } | null)?.from ?? firstAllowedRoute(user.permissions);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Giriş yapılamadı, tekrar deneyin');
    }
  });

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.logo}>E</div>
          <h1 className={styles.title}>EDAS Kesinti &amp; İş Emri</h1>
          <p className={styles.subtitle}>Devam etmek için giriş yapın</p>
        </div>

        <form onSubmit={onSubmit} noValidate className={styles.form}>
          {formError && (
            <div role="alert" className="form-error-banner">
              {formError}
            </div>
          )}

          <div className="field">
            <label htmlFor="email" className="field__label">
              E-posta
            </label>
            <div className="input--icon-wrap">
              <FiMail />
              <input id="email" type="email" autoComplete="username" placeholder="admin@edas.com" className="input" {...register('email')} />
            </div>
            {errors.email && <p className="field__error">{errors.email.message}</p>}
          </div>

          <div className="field">
            <label htmlFor="password" className="field__label">
              Parola
            </label>
            <div className="input--icon-wrap">
              <FiLock />
              <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" className="input" {...register('password')} />
            </div>
            {errors.password && <p className="field__error">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting} className={`btn btn--primary ${styles.submit}`}>
            <FiLogIn />
            {isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>

        <p className={styles.seedHint}>admin@edas.com / Admin123! · kesinti@edas.com / Kesinti123! · isemri@edas.com / IsEmri123!</p>
      </div>
    </div>
  );
}
