import { isPathInScope, scopesFor, type AuthedRequest, type Permission, type Redis } from '@inavitas/shared';
import type { Request, Response } from 'express';

const HEARTBEAT_MS = 30_000;

/** Kapsam süzmesi için mesajın taşıması gereken alan; taşımayan mesaj herkese gider. */
interface ScopedMessage {
  unitPath?: string;
}

/** Bağlı bir SSE istemcisi ve kapsam kararı için gereken bağlamı. */
interface Client {
  res: Response;
  user?: AuthedRequest['user'];
}

/**
 * Redis pub/sub kanalını dinleyip mesajları bağlı tüm SSE istemcilerine tek bir
 * abonelik üzerinden dağıtan (fan-out) hub sınıfı.
 *
 * `scopePermission` verilen kanallarda fan-out **kapsam süzmesinden geçer**: mesaj kaydın
 * `unitPath`'ini taşır ve kapsam dışı bir istemciye hiç yazılmaz. Süzme istemciye
 * bırakılamaz — kapsam dışı bir kaydın kimliği ve konumu olay olarak sızmış olurdu.
 */
export class SseHub {
  private readonly clients = new Set<Client>();

  constructor(
    private readonly channel: string,
    subscriber: Redis,
    private readonly scopePermission?: Permission,
  ) {
    void subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
      if (ch === this.channel) this.broadcast(message);
    });
  }

  /** İstemci bu mesajı görebilir mi. */
  private canSee(client: Client, message: string): boolean {
    if (!this.scopePermission) return true;

    let unitPath: string | undefined;
    try {
      ({ unitPath } = JSON.parse(message) as ScopedMessage);
    } catch {
      return false;
    }

    // Konumu bilinmeyen bir olay süzülemez; kapsamlı bir kanalda bu bir sızıntıdır.
    if (!unitPath || !client.user) return false;
    return isPathInScope(unitPath, scopesFor(client.user, this.scopePermission));
  }

  private broadcast(data: string): void {
    for (const client of this.clients) {
      if (this.canSee(client, data)) client.res.write(`data: ${data}\n\n`);
    }
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

    const client: Client = { res, user: (req as AuthedRequest).user };
    this.clients.add(client);

    // Proxy/tarayıcı zaman aşımını önlemek için düzenli heartbeat (yorum satırı, veri değil).
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(client);
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
    outage: new SseHub('ui:outage', subscriber, 'outage:read'),
    workOrder: new SseHub('ui:work-order', subscriber, 'workorder:read'),
    // Çeviri sözlüğü ve enerjilenme "değişti" sinyali bölgesel değildir; kapsam süzmesi
    // uygulanmaz. Enerjilenme mesajı zaten kayıt kimliği taşımaz, istemci kendi görünüm
    // penceresini yeniden sorgular ve o sorgu kapsamdan geçer.
    translation: new SseHub('ui:translation', subscriber),
    energization: new SseHub('ui:energization', subscriber),
  };
}
