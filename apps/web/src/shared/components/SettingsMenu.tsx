import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useTranslation } from '../../features/i18n/I18nProvider.tsx';
import { useTheme } from '../../features/theme/ThemeProvider.tsx';
import { Switch } from './Switch.tsx';
import styles from './SettingsMenu.module.scss';

const PANEL_WIDTH = 224;
const VIEWPORT_MARGIN = 8;

interface SettingsMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onManageTranslations: () => void;
  canManageTranslations: boolean;
}

/**
 * Sidebar footer'daki ayarlar tetikleyicisinin (⚙ veya avatar) açtığı popover.
 * Konum ve dışarı tıklama/scroll/Escape davranışı `ColumnFilter.tsx`'teki desenin
 * birebir tekrarıdır — tek fark: tetikleyici sidebar'ın ALTINDA olduğu için panel
 * yukarı doğru açılır (`rect.top - panelHeight - 6`).
 */
export function SettingsMenu({ anchorEl, open, onClose, onManageTranslations, canManageTranslations }: SettingsMenuProps) {
  const { t, locale, locales, changeLanguage } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 200;

    setPosition({
      top: Math.max(VIEWPORT_MARGIN, rect.top - panelHeight - 6),
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN)),
    });
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorEl?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    };
    // Sayfa kaydırılırsa panel tetikleyiciden kopar — basitçe kapatmak, konumu
    // yeniden hesaplamaktan daha güvenilirdir (bkz. ColumnFilter.tsx).
    const onScroll = () => onClose();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>('button, select');
        if (!focusables || focusables.length === 0) return;
        const items = Array.from(focusables);
        const current = items.indexOf(document.activeElement as HTMLElement);
        const nextIndex = e.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchorEl]);

  useEffect(() => {
    if (open) {
      panelRef.current?.querySelector<HTMLElement>('button, select')?.focus();
    } else {
      anchorEl?.focus();
    }
    // anchorEl kasıtlı olarak bağımlılıklardan çıkarılır — yalnızca `open` değiştiğinde tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div ref={panelRef} role="menu" className={styles.popover} style={{ top: position.top, left: position.left }}>
      <div className={styles.item}>
        <span>{t('settings.theme.dark')}</span>
        <Switch checked={theme === 'dark'} onChange={toggleTheme} label={t('settings.theme.dark')} />
      </div>

      <div className={styles.item}>
        <span>{t('settings.language.label')}</span>
        <select
          className={clsx('select', 'select--compact')}
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
      </div>

      {canManageTranslations && (
        <>
          <div className={styles.divider} />
          <button type="button" role="menuitem" className={styles.menuButton} onClick={onManageTranslations}>
            {t('settings.translations.manage')}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
