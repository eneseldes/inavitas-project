import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getAccessToken } from '../../shared/api/auth-storage.ts';
import { OUTAGES_KEY } from './useOutages.ts';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const RECONNECT_DELAY_MS = 3_000;

/**
 * Gateway üzerindeki kesinti canlı yayın kanalını (SSE) dinler. Yeni bir mesaj
 * geldiğinde istemci önbelleğindeki kesinti sorgularını günceller.
 *
 * `EventSource` özel HTTP başlığı desteklemediğinden erişim belirteci adres
 * parametresi olarak iletilir. Bağlantı kesildiğinde güncel belirteç ile yeniden denenir.
 */
export function useOutageStream(): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      const token = getAccessToken();
      if (!token || stopped) return;

      source = new EventSource(`${API_URL}/api/outages/stream?access_token=${token}`);
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
