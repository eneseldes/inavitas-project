import { clsx } from 'clsx';
import type { Ref, SelectHTMLAttributes } from 'react';

export interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  ref?: Ref<HTMLSelectElement>;
}

/** Standart `.select` stilini taşıyan çıplak `<select>` sarmalayıcı. */
export function SelectInput({ error, className, ref, children, ...rest }: SelectInputProps) {
  return (
    <select ref={ref} className={clsx('select', error && 'select--error', className)} {...rest}>
      {children}
    </select>
  );
}
