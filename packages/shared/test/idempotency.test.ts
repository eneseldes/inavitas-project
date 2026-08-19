import { describe, expect, it } from 'vitest';
import { markSeenOnce, type Redis } from '../src/redis.ts';

/**
 * `SET key value EX ... NX` davranışını taklit eden asgari sahte Redis.
 * Yalnız `markSeenOnce`'ın kullandığı tek çağrıyı bilir.
 */
function fakeRedis(): Redis & { keys: string[] } {
  const store = new Set<string>();
  const keys: string[] = [];

  return {
    keys,
    async set(key: string) {
      keys.push(key);
      if (store.has(key)) return null;
      store.add(key);
      return 'OK';
    },
  } as unknown as Redis & { keys: string[] };
}

describe('markSeenOnce — Kafka ön filtresi', () => {
  it('aynı servis aynı olayı ikinci kez işlemez', async () => {
    const redis = fakeRedis();

    expect(await markSeenOnce(redis, 'outage-service-group', 'evt-1')).toBe(true);
    expect(await markSeenOnce(redis, 'outage-service-group', 'evt-1')).toBe(false);
  });

  it('AYNI olayı dinleyen FARKLI servisler birbirini engellemez', async () => {
    // Regresyon: anahtar consumer group'a göre ayrılmadığında `outage.created`'i hem
    // work-order-service hem network-service dinlediği için ilk davranan diğerini
    // susturuyordu — kesinti açılınca iş emri hiç oluşmuyordu.
    const redis = fakeRedis();

    expect(await markSeenOnce(redis, 'work-order-service-group', 'evt-1')).toBe(true);
    expect(await markSeenOnce(redis, 'network-service-group', 'evt-1')).toBe(true);
  });

  it('anahtar consumer group ile ad alanına ayrılır', async () => {
    const redis = fakeRedis();
    await markSeenOnce(redis, 'network-service-group', 'evt-1');

    expect(redis.keys).toEqual(['processed:network-service-group:evt-1']);
  });

  it('Redis erişilemezse filtre atlanır, akış Postgres kontrolüne düşer', async () => {
    const broken = {
      async set() {
        throw new Error('bağlantı yok');
      },
    } as unknown as Redis;

    expect(await markSeenOnce(broken, 'outage-service-group', 'evt-1')).toBe(true);
  });
});
