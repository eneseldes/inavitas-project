import { useId, useState, type ReactNode } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field } from './Field.tsx';
import { TextInput, type TextInputProps } from './TextInput.tsx';
import { useFloatingControl } from './useFloatingControl.ts';

export interface PasswordFieldProps
  extends Omit<TextInputProps, 'name' | 'onChange' | 'onBlur' | 'id' | 'type' | 'error' | 'ref'>,
    UseFormRegisterReturn {
  label: string;
  hint?: ReactNode;
  error?: string;
  leadingIcon?: ReactNode;
  id?: string;
  toggleShowLabel?: string;
  toggleHideLabel?: string;
}

/** Göster/gizle butonlu floating-label parola input'u. */
export function PasswordField({
  label,
  hint,
  error,
  leadingIcon,
  id,
  name,
  onChange,
  onBlur,
  ref,
  toggleShowLabel = 'Parolayı göster',
  toggleHideLabel = 'Parolayı gizle',
  ...rest
}: PasswordFieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const [visible, setVisible] = useState(false);
  const { floated, focused, controlProps } = useFloatingControl({ name, onChange, onBlur, ref }, { alwaysFloated: Boolean(error) });
  const descId = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;

  return (
    <Field label={label} hint={hint} error={error} icon={leadingIcon} floated={floated} focused={focused} htmlFor={controlId}>
      <div className="floating-field__control-inline">
        <TextInput
          {...rest}
          id={controlId}
          type={visible ? 'text' : 'password'}
          error={Boolean(error)}
          aria-invalid={error ? true : undefined}
          aria-describedby={descId}
          className="floating-field__toggle-input"
          {...controlProps}
        />
        <button
          type="button"
          className="floating-field__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? toggleHideLabel : toggleShowLabel}
          tabIndex={-1}
        >
          {visible ? <FiEyeOff /> : <FiEye />}
        </button>
      </div>
    </Field>
  );
}
