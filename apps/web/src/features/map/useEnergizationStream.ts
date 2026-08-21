import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { invalidateEnergization, invalidateNetworkRuntime } from './networkRuntime.ts';

const RECONNECT_DELAY_MS = 3_000;

/**
 * Enerjilenme özetinin kendi debounce'ı — `invalidateNetworkRuntime`'ınkinden ayrıdır çünkü
 * bu tazeleme haritanın vurgu kaynağını baştan kurar ve yalnız bu kanaldan tetiklenir.
 */
const INVALIDATE_DEBOUNCE_MS = 300;

/**
 * Gateway'in enerjilenme SSE kanalını dinler.
 *
 * Mesaj **veri taşımaz**, yalnız "değişti" der; istemci vurgu kümesinin yeni token'ını
 * yeniden sorgular. Eleman detayı ve etki önizlemesi de bayatlar (`isEnergized`/
 * `deEnergizedBy`) ama onların tazelenmesi bu kanala ÖZEL değildir — kesinti kanalı da aynı
 * şeyi tetikler, o yüzden ortak bir pencereden geçer (bkz. networkRuntime.ts).
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
        invalidateTimer = setTimeout(() => invalidateEnergization(queryClient), INVALIDATE_DEBOUNCE_MS);
        // Eleman detayı ve etki önizlemesi ORTAK noktadan tazelenir: aynı kesinti hem bu
        // kanalı hem kesinti kanalını tetikliyor, ikisi ayrı ayrı tazelerse aynı graf
        // gezinmesi arka arkaya iki kez yaptırılır (bkz. networkRuntime.ts).
        invalidateNetworkRuntime(queryClient);
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
