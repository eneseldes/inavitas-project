import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field } from './Field.tsx';
import { SelectInput } from './SelectInput.tsx';
import { useFloatingControl } from './useFloatingControl.ts';

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'name' | 'onChange' | 'onBlur' | 'id'>,
    UseFormRegisterReturn {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
}

/**
 * Tek-satır floating-label select — `register` sonucuyla doğrudan kullanılır.
 * `<select>` her zaman bir değere sahip olduğundan (`:placeholder-shown`
 * çalışmaz) label her zaman floated kabul edilir.
 */
export function SelectField({ label, hint, error, id, name, onChange, onBlur, ref, children, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const { floated, focused, controlProps } = useFloatingControl({ name, onChange, onBlur, ref }, { alwaysFloated: true });
  const descId = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;

  return (
    <Field label={label} hint={hint} error={error} floated={floated} focused={focused} htmlFor={controlId}>
      <SelectInput
        {...rest}
        id={controlId}
        error={Boolean(error)}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId}
        {...controlProps}
      >
        {children}
      </SelectInput>
    </Field>
  );
}
