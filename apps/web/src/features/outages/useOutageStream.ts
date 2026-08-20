import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NETWORK_COMPONENT_KEY, NETWORK_IMPACT_PREVIEW_KEY } from '../map/useNetwork.ts';
import { OUTAGES_KEY } from './useOutages.ts';

const RECONNECT_DELAY_MS = 3_000;

/** Art arda gelen olayları TEK invalidate'e toplar — bkz. dosya sonundaki not. */
const INVALIDATE_DEBOUNCE_MS = 300;

/** Gateway'in kesinti SSE kanalını dinler, yeni mesajda kesinti sorgularını invalidate eder. */
export function useOutageStream(): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      if (stopped) return;

      source = new EventSource('/api/outages/stream', { withCredentials: true });
      source.onopen = () => setConnected(true);
      source.onmessage = () => {
        // Toplu bir işlemde (ör. birden çok kesintinin arka arkaya durumu değişince) her olay
        // ayrı ayrı tüm kesinti sorgularını (harita dahil) yeniden çeker ve MapLibre kaynağını
        // `setData` ile baştan kurardı — arka arkaya gelen N olay N kez harita kaynağını
        // sıfırlıyordu. Burada olaylar `INVALIDATE_DEBOUNCE_MS` içinde TEK invalidate'e toplanır.
        clearTimeout(invalidateTimer);
        invalidateTimer = setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: [OUTAGES_KEY] });
          // Eleman detayı ve etki önizlemesi kesintiye bağlı anlık alanlar taşıyor
          // (`deEnergizedBy`, `childOutages`); kesinti değişince onlar da bayatlar.
          void queryClient.invalidateQueries({ queryKey: [NETWORK_COMPONENT_KEY] });
          void queryClient.invalidateQueries({ queryKey: [NETWORK_IMPACT_PREVIEW_KEY] });
        }, INVALIDATE_DEBOUNCE_MS);
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
      clearTimeout(invalidateTimer);
      source?.close();
    };
  }, [queryClient]);

  return connected;
}
