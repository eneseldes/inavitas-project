import { useCallback, useState } from 'react';

/**
 * Katlanabilir grupların açık/kapalı durumu — MODÜL seviyesinde tutulur, React state'i
 * değil. Sağ şeritteki paneller (Katmanlar/Filtreler/Alan Seç) araç değiştirildiğinde
 * `MapPage.tsx`'te koşullu render nedeniyle TAMAMEN unmount olur; sıradan bir `useState`
 * bu yüzden her geri dönüşte varsayılana sıfırlanırdı. Modül kapsamındaki bu harita ise
 * bileşen unmount/mount olsa da hayatta kalır, yalnız sayfa yenilenince sıfırlanır.
 */
const expandedGroups = new Map<string, boolean>();

/** Panel geçişleri arasında hayatta kalan katlanır/aç durumu — varsayılan KAPALI. */
export function useGroupExpanded(key: string, defaultValue = false) {
  const [isOpen, setIsOpen] = useState(() => expandedGroups.get(key) ?? defaultValue);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      expandedGroups.set(key, next);
      return next;
    });
  }, [key]);

  return [isOpen, toggle] as const;
}
