import { Redis } from 'ioredis';

export { Redis } from 'ioredis';

/** Redis istemcisi (client) örneği oluşturur. Bağlantı arka planda otomatik açılır ve kopunca yeniden dener. */
export function createRedisClient(url: string): Redis {
  return new Redis(url);
}

/** Hızlı idempotency ön filtresinde kullanılan anahtarların canlı kalma süresi (Kafka log retention'ıyla aynı: 168 saat). */
const FAST_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 168;

/**
 * Postgres'teki transactional `processed_events` kontrolüne ek, hızlı bir ön filtre.
 * Event daha önce görülmediyse `true`, zaten işlenmişse `false` döner.
 *
 * ⚠️ **`consumer` zorunludur ve atlanamaz.** Tüm servisler AYNI Redis örneğini paylaşır;
 * anahtar consumer group'a göre ayrılmazsa aynı topic'i dinleyen iki servis birbirinin
 * olayını "zaten işlenmiş" sanar ve olayı **ilk davranan servis dışında herkes atlar**.
 * Idempotency her zaman "bu servis bu olayı işledi mi" sorusudur — Postgres tarafında da
 * öyledir, çünkü her servisin kendi `processed_events` tablosu vardır.
 *
 * Asıl doğruluk garantisini hâlâ Postgres veriyor — Redis erişilemezse (bağlantı
 * hatası) bu filtre atlanır ve `true` dönülür, akış Postgres kontrolüne düşer.
 */
export async function markSeenOnce(redis: Redis, consumer: string, eventId: string): Promise<boolean> {
  try {
    const result = await redis.set(
      `processed:${consumer}:${eventId}`,
      '1',
      'EX',
      FAST_IDEMPOTENCY_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  } catch {
    return true;
  }
}
