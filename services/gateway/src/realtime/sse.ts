import type { Redis } from '@inavitas/shared';
import type { Request, Response } from 'express';

const HEARTBEAT_MS = 30_000;

/**
 * Bir Redis kanalını dinleyip mesajları o an bağlı tüm SSE istemcilerine
 * dağıtan küçük bir hub. Her SSE bağlantısı için ayrı bir Redis aboneliği
 * açmak yerine TEK abonelik üzerinden fan-out yapılır (03-YOL-HARITASI Faz 5
 * adım 3: "gateway: SUBSCRIBE ui:outage, açık SSE bağlantılarına yaz").
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
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

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
}

/** Kesinti ve iş emri canlı akışları için hub'ları oluşturur. */
export function createSseHubs(subscriber: Redis): SseHubs {
  return {
    outage: new SseHub('ui:outage', subscriber),
    workOrder: new SseHub('ui:work-order', subscriber),
  };
}
