import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { patchMapQueries, type StatusEvent } from '../map/streamPatch.ts';
import type { WorkOrderMapItem } from '../../types/work-order.ts';
import { WORK_ORDERS_KEY } from './useWorkOrders.ts';

const RECONNECT_DELAY_MS = 3_000;

/** Art arda gelen olayları TEK yamaya toplar — bkz. useOutageStream.ts'teki aynı not. */
const FLUSH_DEBOUNCE_MS = 300;

/**
 * Gateway'in iş emri SSE kanalını dinler. Kesinti akışıyla **birebir aynı** desen: harita
 * katmanı yerinde yamanır, geri kalan sorgular tazelenir (bkz. `patchMapQueries`).
 */
export function useWorkOrderStream(): boolean {
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

      const needsMapRefetch = patchMapQueries<WorkOrderMapItem>(queryClient, WORK_ORDERS_KEY, events);

      void queryClient.invalidateQueries({
        queryKey: [WORK_ORDERS_KEY],
        predicate: (query) => query.queryKey[1] !== 'map',
      });
      if (needsMapRefetch) void queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY, 'map'] });
    }

    function connect(): void {
      if (stopped) return;

      source = new EventSource('/api/work-orders/stream', { withCredentials: true });
      source.onopen = () => setConnected(true);
      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as StatusEvent;
          if (parsed?.id) pending.push({ id: parsed.id, status: parsed.status });
        } catch {
          void queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
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
