import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiLock, FiLogIn, FiMail, FiMoon, FiSun } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../../shared/api/errors.ts';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useTheme } from '../theme/ThemeProvider.tsx';
import styles from './LoginPage.module.scss';
import { ParticleCanvas } from './ParticleCanvas.tsx';
import { useAuth } from './useAuth.tsx';

function useLoginFormSchema() {
  const { t } = useTranslation();
  return z.object({
    email: z.string().email(t('auth.validation.email')),
    password: z.string().min(1, t('auth.validation.passwordRequired')),
  });
}

/** Kullanıcının yetkisi olan ilk ekrana yönlendirir. */
function firstAllowedRoute(permissions: string[]): string {
  if (permissions.includes('outage:read')) return '/outages';
  if (permissions.includes('workorder:read')) return '/work-orders';
  return '/403';
}

export function LoginPage() {
  const { login } = useAuth();
  const { locale, locales, changeLanguage, t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const schema = useLoginFormSchema();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await login(values.email, values.password);
      const redirectTo = (location.state as { from?: string } | null)?.from ?? firstAllowedRoute(user.permissions);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? t(err.message) : t('auth.error.loginFailed'));
    }
  });

  return (
    <div className={styles.page}>
      {/* Sol Taraf: Hareketli Noktalar Animasyonu + Sola Dayalı Tek Satır Başlık */}
      <div className={styles.heroSection}>
        <ParticleCanvas className={styles.particleCanvas} />
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            {t('auth.hero.titleBefore')} <span className={styles.heroBrand}>inavitas</span> {t('auth.hero.titleAfter')}
          </h1>
        </div>
      </div>

      {/* Sağ Taraf: Tek Parça Glassmorphic Giriş Paneli */}
      <div className={styles.loginSection}>
        {/* Dil seçici ve hemen sağında karanlık mod seçimi */}
        <div className={styles.topControls}>
          <select
            className="select select--compact"
            value={locale}
            onChange={(e) => changeLanguage(e.target.value)}
            aria-label={t('settings.language.label')}
          >
            {locales.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={toggleTheme}
            className="icon-btn icon-btn--sm"
            title={theme === 'dark' ? t('settings.theme.light', undefined, 'Açık Mod') : t('settings.theme.dark', undefined, 'Karanlık Mod')}
            aria-label={t('settings.theme.dark')}
          >
            {theme === 'dark' ? <FiSun /> : <FiMoon />}
          </button>
        </div>

        <div className={styles.formWrap}>
          <div className={styles.brandHeader}>
            <img src="/inv-logo.svg" alt="inavitas" className={styles.brandLogo} />
          </div>

          <form onSubmit={onSubmit} noValidate className={styles.form}>
            {formError && (
              <div role="alert" className="form-error-banner">
                {formError}
              </div>
            )}

            <div className="field">
              <label htmlFor="email" className="field__label">
                {t('auth.action.emailLabel')}
              </label>
              <div className="input--icon-wrap">
                <FiMail />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@inavitas.com"
                  className="input"
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="field__error">{errors.email.message}</p>}
            </div>

            <div className="field">
              <label htmlFor="password" className="field__label">
                {t('auth.action.passwordLabel')}
              </label>
              <div className="input--icon-wrap">
                <FiLock />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="input"
                  {...register('password')}
                />
              </div>
              {errors.password && <p className="field__error">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className={`btn btn--primary ${styles.submit}`}>
              <FiLogIn />
              {isSubmitting ? t('auth.action.signingIn') : t('auth.action.signIn')}
            </button>
          </form>

          <p className={styles.seedHint}>
            admin@inavitas.com / Admin123! · kesinti@inavitas.com / Kesinti123! · isemri@inavitas.com / IsEmri123!
          </p>
        </div>
      </div>
    </div>
  );
}
