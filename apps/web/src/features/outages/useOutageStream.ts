import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { OUTAGES_KEY } from './useOutages.ts';

const RECONNECT_DELAY_MS = 3_000;

/** Gateway'in kesinti SSE kanalını dinler, yeni mesajda kesinti sorgularını invalidate eder. */
export function useOutageStream(): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      if (stopped) return;

      source = new EventSource('/api/outages/stream', { withCredentials: true });
      source.onopen = () => setConnected(true);
      source.onmessage = () => void queryClient.invalidateQueries({ queryKey: [OUTAGES_KEY] });
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
      source?.close();
    };
  }, [queryClient]);

  return connected;
}
