import { clsx } from 'clsx';
import type { Ref, TextareaHTMLAttributes } from 'react';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * Standart `.input` stilini taşıyan çıplak `<textarea>` sarmalayıcı. Tarayıcı önerisi
 * `TextInput` ile aynı gerekçeyle kapalıdır.
 */
export function TextArea({ error, className, ref, rows = 3, ...rest }: TextAreaProps) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={clsx('input', 'input--textarea', error && 'input--error', className)}
      autoComplete="off"
      {...rest}
    />
  );
}
