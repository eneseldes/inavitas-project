import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field } from './Field.tsx';
import { TextArea } from './TextArea.tsx';
import { useFloatingControl } from './useFloatingControl.ts';

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'onChange' | 'onBlur' | 'id'>,
    UseFormRegisterReturn {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
}

/** Tek-satır floating-label textarea — `register` sonucuyla doğrudan kullanılır. */
export function TextAreaField({ label, hint, error, id, name, onChange, onBlur, ref, ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const { floated, focused, controlProps } = useFloatingControl({ name, onChange, onBlur, ref }, { alwaysFloated: Boolean(error) });
  const descId = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;

  return (
    <Field label={label} hint={hint} error={error} floated={floated} focused={focused} htmlFor={controlId}>
      <TextArea
        {...rest}
        id={controlId}
        error={Boolean(error)}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId}
        {...controlProps}
      />
    </Field>
  );
}
