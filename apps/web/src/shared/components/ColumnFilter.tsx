import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiFilter } from 'react-icons/fi';
import { clsx } from 'clsx';
import { useTranslation } from '../../features/i18n/I18nProvider.tsx';
import styles from './ColumnFilter.module.scss';

export interface FilterOption {
  value: string;
  label: string;
}

export interface DateFilterValue {
  operator?: 'between' | 'after' | 'before';
  from?: string;
  to?: string;
}

export interface NumberRangeFilterValue {
  min?: number;
  max?: number;
}

interface TextFilterProps {
  type: 'text';
  value: string;
  onApply: (value: string) => void;
  placeholder?: string;
}

interface SelectFilterProps {
  type: 'select';
  value: string;
  onApply: (value: string) => void;
  options: FilterOption[];
}

interface MultiSelectFilterProps {
  type: 'multiselect';
  value: string[];
  onApply: (value: string[]) => void;
  options: FilterOption[];
}

interface DateFilterProps {
  type: 'date';
  value: DateFilterValue;
  onApply: (value: DateFilterValue) => void;
}

interface NumberRangeFilterProps {
  type: 'numberRange';
  value: NumberRangeFilterValue;
  onApply: (value: NumberRangeFilterValue) => void;
}

export type ColumnFilterProps = (
  | TextFilterProps
  | SelectFilterProps
  | MultiSelectFilterProps
  | DateFilterProps
  | NumberRangeFilterProps
) & { label: string };

// .popover'daki `width: 14rem` ile birebir aynı — konum hesabı için gerekiyor.
const POPOVER_WIDTH = 224;
const VIEWPORT_MARGIN = 8;

/**
 * Sütun başlığında filtreleme paneli açan ortak bileşen.
 * Taşma (overflow) sorunlarını önlemek için panel `createPortal` ile gövdeye (`body`) yerleştirilir.
 */
export function ColumnFilter(props: ColumnFilterProps) {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isActive =
    props.type === 'text' || props.type === 'select'
      ? props.value.trim().length > 0
      : props.type === 'multiselect'
        ? props.value.length > 0
        : props.type === 'numberRange'
          ? props.value.min !== undefined || props.value.max !== undefined
          : Boolean(props.value?.from || props.value?.to);

  const openPopover = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPosition({
      top: rect.bottom + 6,
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN)),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;

    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    // Sayfa kaydırılırsa `position: fixed` panel tetikleyiciden kopar —
    // basitçe kapatmak, konumu yeniden hesaplamaktan daha güvenilir.
    const onScroll = () => setOpen(false);

    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          isOpen ? setOpen(false) : openPopover();
        }}
        title={t('common.filter.trigger', { label: props.label })}
        className={clsx(styles.trigger, isActive && styles.triggerActive)}
      >
        <FiFilter />
      </button>

      {isOpen &&
        createPortal(
          <div ref={popoverRef} className={styles.popover} style={{ top: position.top, left: position.left }} onClick={(e) => e.stopPropagation()}>
            {props.type === 'text' ? (
              <TextFilterBody {...props} onDone={() => setOpen(false)} />
            ) : props.type === 'select' ? (
              <SelectFilterBody {...props} onDone={() => setOpen(false)} />
            ) : props.type === 'multiselect' ? (
              <MultiSelectFilterBody {...props} onDone={() => setOpen(false)} />
            ) : props.type === 'numberRange' ? (
              <NumberRangeFilterBody {...props} onDone={() => setOpen(false)} />
            ) : (
              <DateFilterBody {...props} onDone={() => setOpen(false)} />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function TextFilterBody({ value, onApply, placeholder, onDone }: TextFilterProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  return (
    <div>
      <input
        autoFocus
        className="input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onApply(draft);
            onDone();
          }
        }}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setDraft('');
            onApply('');
            onDone();
          }}
        >
          {t('common.filter.clear')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onApply(draft);
            onDone();
          }}
        >
          {t('common.filter.apply')}
        </button>
      </div>
    </div>
  );
}

/** Backend'in tek değer kabul ettiği alanlar için — checkbox listesi yerine radio grubu. */
function SelectFilterBody({ value, onApply, options, onDone }: SelectFilterProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  return (
    <div>
      <div className={styles.optionList}>
        <label className={styles.option}>
          <input type="radio" name="column-select-filter" checked={draft === ''} onChange={() => setDraft('')} />
          {t('common.filter.any', undefined, 'Tümü')}
        </label>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name="column-select-filter"
              checked={draft === option.value}
              onChange={() => setDraft(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setDraft('');
            onApply('');
            onDone();
          }}
        >
          {t('common.filter.clear')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onApply(draft);
            onDone();
          }}
        >
          {t('common.filter.apply')}
        </button>
      </div>
    </div>
  );
}

function MultiSelectFilterBody({ value, onApply, options, onDone }: MultiSelectFilterProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string[]>(value);

  const toggle = (optionValue: string) => {
    setDraft((prev) => (prev.includes(optionValue) ? prev.filter((v) => v !== optionValue) : [...prev, optionValue]));
  };

  return (
    <div>
      <div className={styles.optionList}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input type="checkbox" checked={draft.includes(option.value)} onChange={() => toggle(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setDraft([]);
            onApply([]);
            onDone();
          }}
        >
          {t('common.filter.clear')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onApply(draft);
            onDone();
          }}
        >
          {t('common.filter.apply')}
        </button>
      </div>
    </div>
  );
}

function DateFilterBody({ value, onApply, onDone }: DateFilterProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const [operator, setOperator] = useState<'between' | 'after' | 'before'>(value?.operator ?? 'between');
  const [from, setFrom] = useState(value?.from ?? '');
  const [to, setTo] = useState(value?.to ?? '');

  return (
    <div>
      <div className={styles.dateGroup}>
        <div className={styles.dateField}>
          <span className={styles.dateLabel}>{t('common.filter.date.operator', undefined, 'Filtre Modu')}</span>
          <select className="select" value={operator} onChange={(e) => setOperator(e.target.value as 'between' | 'after' | 'before')}>
            <option value="between">{t('common.filter.date.between', undefined, 'Tarihler Arası')}</option>
            <option value="after">{t('common.filter.date.after', undefined, 'Sonrasında (>=)')}</option>
            <option value="before">{t('common.filter.date.before', undefined, 'Öncesinde (<=)')}</option>
          </select>
        </div>

        {(operator === 'between' || operator === 'after') && (
          <div className={styles.dateField}>
            <span className={styles.dateLabel}>{t('common.filter.date.from', undefined, 'Başlangıç')}</span>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
        )}

        {(operator === 'between' || operator === 'before') && (
          <div className={styles.dateField}>
            <span className={styles.dateLabel}>{t('common.filter.date.to', undefined, 'Bitiş')}</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            onApply({ operator: 'between', from: '', to: '' });
            onDone();
          }}
        >
          {t('common.filter.clear')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onApply({
              operator,
              from: operator === 'before' ? '' : from,
              to: operator === 'after' ? '' : to,
            });
            onDone();
          }}
        >
          {t('common.filter.apply')}
        </button>
      </div>
    </div>
  );
}

function NumberRangeFilterBody({ value, onApply, onDone }: NumberRangeFilterProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const [min, setMin] = useState(value?.min !== undefined ? String(value.min) : '');
  const [max, setMax] = useState(value?.max !== undefined ? String(value.max) : '');

  return (
    <div>
      <div className={styles.dateGroup}>
        <div className={styles.dateField}>
          <span className={styles.dateLabel}>{t('common.filter.number.min', undefined, 'En az')}</span>
          <input type="number" className="input" value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
        <div className={styles.dateField}>
          <span className={styles.dateLabel}>{t('common.filter.number.max', undefined, 'En çok')}</span>
          <input type="number" className="input" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setMin('');
            setMax('');
            onApply({});
            onDone();
          }}
        >
          {t('common.filter.clear')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onApply({
              min: min !== '' ? Number(min) : undefined,
              max: max !== '' ? Number(max) : undefined,
            });
            onDone();
          }}
        >
          {t('common.filter.apply')}
        </button>
      </div>
    </div>
  );
}
