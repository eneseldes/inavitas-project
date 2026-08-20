import type { Redis } from '@inavitas/shared';
import type { Request, Response } from 'express';

const HEARTBEAT_MS = 30_000;

/**
 * Redis pub/sub kanalını dinleyip mesajları bağlı tüm SSE istemcilerine tek bir
 * abonelik üzerinden dağıtan (fan-out) hub sınıfı.
 */
export class SseHub {
  private readonly clients = new Set<Response>();

  constructor(
    private readonly channel: string,
    subscriber: Redis,
  ) {
    void subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === this.channel) this.broadcast(message);
    });
  }

  private broadcast(data: string): void {
    for (const res of this.clients) res.write(`data: ${data}\n\n`);
  }

  /** İsteği açık bir SSE bağlantısına çevirir ve hub'a kaydeder. */
  handle(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // Proxy (Vite/Nginx) arabelleklerini boşaltıp tarayıcıda onopen'ı derhal tetiklemek için ilk baytı yaz.
    res.write(': connected\n\n');

    this.clients.add(res);

    // Proxy/tarayıcı zaman aşımını önlemek için düzenli heartbeat (yorum satırı, veri değil).
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  }
}

export interface SseHubs {
  outage: SseHub;
  workOrder: SseHub;
  translation: SseHub;
  /** Enerjilenme değişimleri — mesaj veri taşımaz, yalnız "değişti" der. */
  energization: SseHub;
}

/** Kesinti, iş emri, çeviri ve enerjilenme canlı akışları için hub'ları oluşturur. */
export function createSseHubs(subscriber: Redis): SseHubs {
  return {
    outage: new SseHub('ui:outage', subscriber),
    workOrder: new SseHub('ui:work-order', subscriber),
    translation: new SseHub('ui:translation', subscriber),
    energization: new SseHub('ui:energization', subscriber),
  };
}
