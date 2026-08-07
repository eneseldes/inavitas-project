import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getAccessToken } from '../../shared/api/auth-storage.ts';
import { WORK_ORDERS_KEY } from './useWorkOrders.ts';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const RECONNECT_DELAY_MS = 3_000;

/**
 * Gateway üzerindeki iş emri canlı yayın kanalını (SSE) dinler. Yeni bir mesaj
 * geldiğinde istemci önbelleğindeki iş emri sorgularını günceller.
 */
export function useWorkOrderStream(): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      const token = getAccessToken();
      if (!token || stopped) return;

      source = new EventSource(`${API_URL}/api/work-orders/stream?access_token=${token}`);
      source.onopen = () => setConnected(true);
      source.onmessage = () => void queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
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
