import { FiLock } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import styles from './ForbiddenPage.module.scss';

export function ForbiddenPage() {
  return (
    <div className={styles.page}>
      <div className={styles.iconWrap}>
        <FiLock />
      </div>
      <h1 className={styles.title}>403 — Bu sayfaya erişim yetkiniz yok</h1>
      <p className={styles.message}>Bu ekranı görüntülemek için gereken izne sahip değilsiniz. Yanlışlık olduğunu düşünüyorsanız yöneticinizle iletişime geçin.</p>
      <Link to="/" className={styles.backLink}>
        Ana sayfaya dön
      </Link>
    </div>
  );
}
