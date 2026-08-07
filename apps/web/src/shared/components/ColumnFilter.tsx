import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiFilter } from 'react-icons/fi';
import { clsx } from 'clsx';
import styles from './ColumnFilter.module.scss';

export interface FilterOption {
  value: string;
  label: string;
}

interface TextFilterProps {
  type: 'text';
  value: string;
  onApply: (value: string) => void;
  placeholder?: string;
}

interface MultiSelectFilterProps {
  type: 'multiselect';
  value: string[];
  onApply: (value: string[]) => void;
  options: FilterOption[];
}

export type ColumnFilterProps = (TextFilterProps | MultiSelectFilterProps) & { label: string };

// .popover'daki `width: 14rem` ile birebir aynı — konum hesabı için gerekiyor.
const POPOVER_WIDTH = 224;
const VIEWPORT_MARGIN = 8;

/**
 * Sütun başlığında filtreleme paneli açan ortak bileşen.
 * Taşma (overflow) sorunlarını önlemek için panel `createPortal` ile gövdeye (`body`) yerleştirilir.
 */
export function ColumnFilter(props: ColumnFilterProps) {
  const [isOpen, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isActive = props.type === 'text' ? props.value.trim().length > 0 : props.value.length > 0;

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
        title={`${props.label} filtrele`}
        className={clsx(styles.trigger, isActive && styles.triggerActive)}
      >
        <FiFilter />
      </button>

      {isOpen &&
        createPortal(
          <div ref={popoverRef} className={styles.popover} style={{ top: position.top, left: position.left }} onClick={(e) => e.stopPropagation()}>
            {props.type === 'text' ? <TextFilterBody {...props} onDone={() => setOpen(false)} /> : <MultiSelectFilterBody {...props} onDone={() => setOpen(false)} />}
          </div>,
          document.body,
        )}
    </>
  );
}

function TextFilterBody({ value, onApply, placeholder, onDone }: TextFilterProps & { onDone: () => void }) {
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
          Temizle
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onApply(draft);
            onDone();
          }}
        >
          Uygula
        </button>
      </div>
    </div>
  );
}

function MultiSelectFilterBody({ value, onApply, options, onDone }: MultiSelectFilterProps & { onDone: () => void }) {
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
          Temizle
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            onApply(draft);
            onDone();
          }}
        >
          Uygula
        </button>
      </div>
    </div>
  );
}
