import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field } from './Field.tsx';
import { TextInput } from './TextInput.tsx';
import { useFloatingControl } from './useFloatingControl.ts';

// `:placeholder-shown` bu tiplerde çalışmaz (her zaman "değeri var" sayılır) —
// bu yüzden floated durumu her zaman true kabul edilir.
const ALWAYS_FLOATED_TYPES = new Set(['date', 'datetime-local', 'time', 'month', 'week']);

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'onChange' | 'onBlur' | 'id'>,
    UseFormRegisterReturn {
  label: string;
  hint?: ReactNode;
  error?: string;
  leadingIcon?: ReactNode;
  id?: string;
}

/** Tek-satır floating-label text input — `register` sonucuyla doğrudan kullanılır. */
export function TextField({ label, hint, error, leadingIcon, id, name, onChange, onBlur, ref, type, ...rest }: TextFieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  // Hata varsa label her zaman yukarıda dursun (odaklanma/dolu olma
  // beklemeden) — kullanıcı hangi alanın hatalı olduğunu anında görsün.
  const alwaysFloated = (type ? ALWAYS_FLOATED_TYPES.has(type) : false) || Boolean(error);
  const { floated, focused, controlProps } = useFloatingControl({ name, onChange, onBlur, ref }, { alwaysFloated });
  const descId = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;

  return (
    <Field label={label} hint={hint} error={error} icon={leadingIcon} floated={floated} focused={focused} htmlFor={controlId}>
      <TextInput
        {...rest}
        id={controlId}
        type={type}
        error={Boolean(error)}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId}
        {...controlProps}
      />
    </Field>
  );
}
