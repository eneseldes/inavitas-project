import { clsx } from 'clsx';
import type { ReactElement, ReactNode } from 'react';

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  icon?: ReactNode;
  htmlFor: string;
  floated: boolean;
  focused: boolean;
  children: ReactElement;
}

/**
 * Floating-label sarmalayıcı — label/hint/hata yerleşimini yönetir.
 * `floated`/`focused` çağıran (`TextField` vb.) tarafından `useFloatingControl`
 * ile hesaplanıp verilir; `Field` kendisi state tutmaz, yalnızca render eder.
 * Özel durumlar (ör. hazır bir kontrol üzerinde elle floated yönetimi) için
 * doğrudan kullanılabilir.
 */
export function Field({ label, hint, error, icon, htmlFor, floated, focused, children }: FieldProps) {
  const descId = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div
      className={clsx(
        'floating-field',
        icon && 'floating-field--icon',
        floated && 'floating-field--floated',
        focused && 'floating-field--focused',
        error && 'floating-field--error',
      )}
    >
      <div className="floating-field__control-wrap">
        {icon && <span className="floating-field__icon">{icon}</span>}
        {children}
        <label htmlFor={htmlFor} className="floating-field__label">
          {label}
        </label>
      </div>
      {error ? (
        <p className="floating-field__error" id={descId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="floating-field__hint" id={descId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
