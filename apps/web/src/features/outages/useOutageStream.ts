import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getAccessToken } from '../../shared/api/auth-storage.ts';
import { OUTAGES_KEY } from './useOutages.ts';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const RECONNECT_DELAY_MS = 3_000;

/**
 * Gateway'in Redis pub/sub'dan SSE'ye çevirdiği kesinti kanalını dinler ve
 * mesaj geldiğinde ilgili sorguları invalidate eder — kullanıcı artık elle
 * yenilemek zorunda değil (03-YOL-HARITASI Faz 5 adım 4).
 *
 * `EventSource` özel header gönderemediği için token query param'dan geçirilir;
 * bağlantı koparsa (ör. access token 15 dk sonra süresi dolduysa) güncel
 * token'la yeniden bağlanmayı dener.
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
