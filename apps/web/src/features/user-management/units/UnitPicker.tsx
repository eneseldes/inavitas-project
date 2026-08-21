import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { FiChevronDown, FiChevronRight, FiSearch } from 'react-icons/fi';
import { useDebounce } from '../../../shared/hooks/useDebounce.ts';
import { useTranslation } from '../../i18n/I18nProvider.tsx';
import { unitFullName, type UnitNode } from '../../../types/user-management.ts';
import { UnitTree } from './UnitTree.tsx';
import styles from './UnitPicker.module.scss';

interface UnitPickerProps {
  value: string;
  onChange: (unitPath: string) => void;
  /** Seçili birimin gösterilecek adı; yoksa ham yol yazılır (henüz yüklenmemiş olabilir). */
  valueLabel?: string;
}

/**
 * Birim seçici — düz bir `<select>` olamaz: 1.463 kayıt var.
 *
 * Ağacın kendisi `UnitTree`'den gelir; burada yalnız açılır kutu, arama ve seçim davranışı
 * var. Birimler sekmesindeki ağaçla aynı bileşeni paylaşır.
 */
export function UnitPicker({ value, onChange, valueLabel }: UnitPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const rootRef = useRef<HTMLDivElement>(null);

  // Dışarı tıklama kapatır; modal içinde açıldığı için `Escape` modali de kapatmasın diye
  // olay burada durdurulur.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen]);

  const select = (unit: UnitNode) => {
    onChange(unit.path);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className={styles.picker} ref={rootRef}>
      <button
        type="button"
        className={clsx('select', styles.trigger)}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={clsx(styles.value, !value && styles.placeholder)}>
          {valueLabel ?? value ?? t('user-management.unit.picker.placeholder')}
        </span>
        <FiChevronDown className={styles.triggerIcon} />
      </button>

      {isOpen && (
        <div className={styles.popover}>
          <label className={styles.searchBox}>
            <FiSearch />
            <input
              type="search"
              autoComplete="off"
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('user-management.unit.picker.searchPlaceholder')}
              autoFocus
            />
          </label>

          <div className={styles.list}>
            <UnitTree
              search={debouncedSearch}
              fallback={({ isLoading }) => (
                <p className={styles.empty}>
                  {isLoading ? t('common.loading') : t('user-management.unit.picker.empty')}
                </p>
              )}
            >
              {({ unit, depth, isExpanded, hasChildren, toggle }) => (
                <div className={styles.row} style={{ paddingInlineStart: `${8 + depth * 16}px` }}>
                  <button
                    type="button"
                    className={clsx(styles.chevron, isExpanded && styles.chevronOpen)}
                    onClick={toggle}
                    disabled={!hasChildren}
                    aria-label={t('common.action.expandMenu')}
                  >
                    {hasChildren && <FiChevronRight />}
                  </button>
                  <button
                    type="button"
                    className={clsx(styles.option, unit.path === value && styles.optionSelected)}
                    onClick={() => select(unit)}
                    title={unitFullName(unit)}
                  >
                    {unit.name}
                  </button>
                </div>
              )}
            </UnitTree>
          </div>
        </div>
      )}
    </div>
  );
}
