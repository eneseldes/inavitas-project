import { useEffect, useState } from 'react';

/**
 * Girdideki değişimi belirtilen süre (milisaniye) boyunca sönümleyerek (debounce) gecikmeli günceller.
 * Arama kutularında her harf basışında sunucuya istek atılmasını engellemek için kullanılır.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
