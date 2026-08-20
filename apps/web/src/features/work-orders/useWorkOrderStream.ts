import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { WORK_ORDERS_KEY } from './useWorkOrders.ts';

const RECONNECT_DELAY_MS = 3_000;

/** Art arda gelen olayları TEK invalidate'e toplar — bkz. useOutageStream.ts'teki aynı not. */
const INVALIDATE_DEBOUNCE_MS = 300;

/** Gateway'in iş emri SSE kanalını dinler, yeni mesajda iş emri sorgularını invalidate eder. */
export function useWorkOrderStream(): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      if (stopped) return;

      source = new EventSource('/api/work-orders/stream', { withCredentials: true });
      source.onopen = () => setConnected(true);
      source.onmessage = () => {
        clearTimeout(invalidateTimer);
        invalidateTimer = setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
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
