import { clsx } from 'clsx';
import type { InputHTMLAttributes, Ref } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** Standart `.input` stilini taşıyan çıplak `<input>` sarmalayıcı. */
export function TextInput({ error, className, ref, ...rest }: TextInputProps) {
  return <input ref={ref} className={clsx('input', error && 'input--error', className)} {...rest} />;
}
