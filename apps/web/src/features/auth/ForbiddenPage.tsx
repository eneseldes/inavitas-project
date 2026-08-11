import { FiLock } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import styles from './ForbiddenPage.module.scss';

export function ForbiddenPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <div className={styles.iconWrap}>
        <FiLock />
      </div>
      <h1 className={styles.title}>{t('auth.forbidden.title')}</h1>
      <p className={styles.message}>{t('auth.forbidden.description')}</p>
      <Link to="/" className={styles.backLink}>
        {t('auth.forbidden.back')}
      </Link>
    </div>
  );
}
