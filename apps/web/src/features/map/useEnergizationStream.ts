import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NETWORK_COMPONENT_KEY, NETWORK_ENERGIZATION_KEY, NETWORK_IMPACT_PREVIEW_KEY } from './useNetwork.ts';

const RECONNECT_DELAY_MS = 3_000;

/** Art arda gelen olayları TEK invalidate'e toplar (bkz. `useOutageStream`). */
const INVALIDATE_DEBOUNCE_MS = 300;

/**
 * Gateway'in enerjilenme SSE kanalını dinler.
 *
 * Mesaj **veri taşımaz**, yalnız "değişti" der; istemci kendi görünüm penceresi için yeniden
 * sorgular. Enerjilenme sorgusunun yanında eleman detayı ve etki önizlemesi de tazelenir:
 * ikisi de `isEnergized`/`deEnergizedBy` taşıyor, bayat kalırlarsa panel haritayla çelişir.
 */
export function useEnergizationStream(): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      if (stopped) return;

      source = new EventSource('/api/network/energization/stream', { withCredentials: true });
      source.onopen = () => setConnected(true);
      source.onmessage = () => {
        clearTimeout(invalidateTimer);
        invalidateTimer = setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: [NETWORK_ENERGIZATION_KEY] });
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
