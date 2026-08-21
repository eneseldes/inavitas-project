import { clsx } from 'clsx';
import type { InputHTMLAttributes, Ref } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Standart `.input` stilini taşıyan çıplak `<input>` sarmalayıcı.
 *
 * Tarayıcının "daha önce girilenler" önerisi VARSAYILAN OLARAK KAPALIDIR: uygulama kendi
 * verisini kendi listelerinden sunuyor, tarayıcının geçmişten doldurduğu kutu hem ekranı
 * kapatıyor hem başka kullanıcının girdiğini gösterebiliyordu. `spellCheck` de kapalı —
 * alanların çoğu ad, kod ya da kimlik taşıyor, sözlük denetimi anlamsız kırmızı çizgi çiziyor.
 */
export function TextInput({ error, className, ref, ...rest }: TextInputProps) {
  return (
    <input
      ref={ref}
      className={clsx('input', error && 'input--error', className)}
      autoComplete="off"
      spellCheck={false}
      {...rest}
    />
  );
}
