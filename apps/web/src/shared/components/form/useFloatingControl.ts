import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';

type ControlEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

interface RegisterLike<T extends ControlEl> {
  name: string;
  onChange: (event: ChangeEvent<T>) => unknown;
  onBlur: (event: FocusEvent<T>) => unknown;
  ref: (instance: T | null) => void;
}

interface FloatingControlOptions {
  /** select / date / datetime-local gibi `:placeholder-shown` çalışmayan tipler için true. */
  alwaysFloated?: boolean;
}

/**
 * Floating-label durumunu (`focused`/`filled`) JS ile yönetir — `:placeholder-shown`
 * select ve date/datetime-local input'larda çalışmadığı için CSS'e güvenilmiyor.
 * RHF `register()` ref/onChange/onBlur'unu sarmalayıp aynı davranışı korur.
 */
export function useFloatingControl<T extends ControlEl>(registerProps: RegisterLike<T>, options?: FloatingControlOptions) {
  const innerRef = useRef<T | null>(null);
  const [focused, setFocused] = useState(false);
  const [filled, setFilled] = useState(false);

  // RHF, `useForm({ defaultValues })`'taki değeri ref bağlandığı sırada DOM'a
  // yazar — bu commit sonrası bir efektte okunmalı, aksi halde edit formlarında
  // (ör. dolu bir e-posta alanı) label yanlışlıkla input içinde kalır.
  useEffect(() => {
    if (innerRef.current && innerRef.current.value) {
      setFilled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRef = (node: T | null) => {
    innerRef.current = node;
    registerProps.ref(node);
  };

  const onFocus = () => setFocused(true);

  const onBlur = (event: FocusEvent<T>) => {
    setFocused(false);
    setFilled(Boolean(event.target.value));
    registerProps.onBlur(event);
  };

  const onChange = (event: ChangeEvent<T>) => {
    setFilled(Boolean(event.target.value));
    registerProps.onChange(event);
  };

  const floated = Boolean(options?.alwaysFloated) || focused || filled;

  return {
    floated,
    focused,
    controlProps: {
      name: registerProps.name,
      ref: setRef,
      onFocus,
      onBlur,
      onChange,
    },
  };
}
