import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { invalidateNetworkRuntime } from '../map/networkRuntime.ts';
import { patchMapQueries, type StatusEvent } from '../map/streamPatch.ts';
import type { OutageMapItem } from '../../types/outage.ts';
import { OUTAGES_KEY } from './useOutages.ts';

const RECONNECT_DELAY_MS = 3_000;

/**
 * Art arda gelen olaylar bu pencerede biriktirilir. Debounce artık "tek isteğe topla" için
 * değil, **tek yamaya topla** için: toplu bir durum değişikliğinde React her olayda yeniden
 * render etmesin diye.
 */
const FLUSH_DEBOUNCE_MS = 300;

/**
 * Gateway'in kesinti SSE kanalını dinler.
 *
 * Mesaj `{ id, cbsId, status, unitPath }` taşır ve bu **kullanılır**: harita katmanı yerinde
 * yamanır, ağ isteği yapılmaz (bkz. `patchMapQueries`). Tazeleme yalnız iki yerde kalır:
 * - harita önbelleğinde olmayan bir kimlik geldiyse (yeni kayıt),
 * - harita dışındaki kesinti sorguları (liste, detay, geçmiş, etkilenen aboneler) — bunlar
 *   sayfalama/sıralama taşıdığı için yerinde yamanamaz, ama haritayı da sıfırlamazlar.
 */
export function useOutageStream(): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    let pending: StatusEvent[] = [];
    let stopped = false;

    function flush(): void {
      const events = pending;
      pending = [];

      const needsMapRefetch = patchMapQueries<OutageMapItem>(queryClient, OUTAGES_KEY, events);

      void queryClient.invalidateQueries({
        queryKey: [OUTAGES_KEY],
        // Harita sorgusu bilerek dışarıda: yukarıda yerinde yamandı. Yamanamayan tek durum
        // (bilinmeyen kimlik) aşağıda ayrıca tazelenir.
        predicate: (query) => query.queryKey[1] !== 'map',
      });
      if (needsMapRefetch) void queryClient.invalidateQueries({ queryKey: [OUTAGES_KEY, 'map'] });

      // Eleman detayı ve etki önizlemesi kesintiye bağlı anlık alanlar taşıyor
      // (`deEnergizedBy`, `childOutages`); kesinti değişince onlar da bayatlar. Tazeleme
      // ORTAK noktadan geçer — aynı olay zinciri iş emri ve enerjilenme kanallarını da
      // tetikliyor ve üçü ayrı ayrı tazelerse aynı hesap dört kez yaptırılıyor.
      invalidateNetworkRuntime(queryClient);
    }

    function connect(): void {
      if (stopped) return;

      source = new EventSource('/api/outages/stream', { withCredentials: true });
      source.onopen = () => setConnected(true);
      source.onmessage = (event) => {
        // Gövde okunamazsa olay yine de "bir şey değişti" demektir; boş bir olayla akış
        // tazelemeye düşer (`patchMapQueries` boş listede hiçbir şey yapmaz, invalidate kalır).
        try {
          const parsed = JSON.parse(event.data as string) as StatusEvent;
          if (parsed?.id) pending.push({ id: parsed.id, status: parsed.status });
        } catch {
          void queryClient.invalidateQueries({ queryKey: [OUTAGES_KEY] });
        }

        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
      };
      source.onerror = () => {
        setConnected(false);
        source?.close();
        retryTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(flushTimer);
      source?.close();
    };
  }, [queryClient]);

  return connected;
}
