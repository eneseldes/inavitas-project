import type { AuthenticatedUser, Redis } from '@inavitas/shared';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SseHub } from '../src/realtime/sse.ts';

/**
 * Faz 9'un güvenlik testlerinden "kapsam dışı kesinti/iş emri **SSE olaylarına** girmiyor"
 * maddesinin otomatik karşılığı.
 *
 * ⚠️ Süzme istemciye bırakılamaz: istemcide süzülen şey zaten sızmıştır. Kapsam dışı bir
 * kaydın kimliği ve konumu olay gövdesinde taşınıyor; hub yazmadan önce karar vermeli.
 */

/** Redis pub/sub yerine geçen sahte istemci: `subscribe` yutar, `message` elle tetiklenir. */
function fakeSubscriber(): { redis: Redis; publish: (channel: string, message: string) => void } {
  const listeners: ((channel: string, message: string) => void)[] = [];

  const redis = {
    subscribe: () => Promise.resolve(1),
    on: (event: string, handler: (channel: string, message: string) => void) => {
      if (event === 'message') listeners.push(handler);
    },
  } as unknown as Redis;

  return { redis, publish: (channel, message) => listeners.forEach((l) => l(channel, message)) };
}

/** Yazılanları toplayan sahte SSE yanıtı. */
function fakeClient(user?: AuthenticatedUser): { req: Request; res: Response; written: string[] } {
  const written: string[] = [];
  const res = {
    writeHead: () => res,
    flushHeaders: () => undefined,
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
  } as unknown as Response;

  const req = { user, on: () => undefined } as unknown as Request;
  return { req, res, written };
}

function userWith(scopes: Record<string, string[]>): AuthenticatedUser {
  return { id: 'u1', email: 'a@b.c', roles: [], permissions: Object.keys(scopes), scopes };
}

/** İlk yazım her zaman `: connected` yorumudur; veri satırları ondan sonra gelir. */
function dataLines(written: string[]): string[] {
  return written.filter((line) => line.startsWith('data: '));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SseHub — kapsamlı kanal', () => {
  it('kapsam içindeki kaydı yazar, dışındakini yazmaz', () => {
    const { redis, publish } = fakeSubscriber();
    const hub = new SseHub('ui:outage', redis, 'outage:read');

    const kecioren = fakeClient(userWith({ 'outage:read': ['TR.06.012'] }));
    const yenimahalle = fakeClient(userWith({ 'outage:read': ['TR.06.020'] }));
    hub.handle(kecioren.req, kecioren.res);
    hub.handle(yenimahalle.req, yenimahalle.res);

    publish('ui:outage', JSON.stringify({ id: 'o1', unitPath: 'TR.06.012.0137' }));

    expect(dataLines(kecioren.written)).toHaveLength(1);
    expect(dataLines(yenimahalle.written)).toHaveLength(0);
  });

  it('konumu bilinmeyen olay kapsamlı kanalda kimseye gitmez', () => {
    // `unitPath` taşımayan bir mesaj süzülemez; kapsamlı bir kanalda bu bir sızıntıdır.
    const { redis, publish } = fakeSubscriber();
    const hub = new SseHub('ui:outage', redis, 'outage:read');

    const client = fakeClient(userWith({ 'outage:read': ['TR.06'] }));
    hub.handle(client.req, client.res);

    publish('ui:outage', JSON.stringify({ id: 'o1' }));

    expect(dataLines(client.written)).toHaveLength(0);
  });

  it('bozuk JSON kimseye gitmez', () => {
    const { redis, publish } = fakeSubscriber();
    const hub = new SseHub('ui:outage', redis, 'outage:read');

    const client = fakeClient(userWith({ 'outage:read': ['TR.06'] }));
    hub.handle(client.req, client.res);

    publish('ui:outage', '{bozuk');

    expect(dataLines(client.written)).toHaveLength(0);
  });

  it('kimliksiz istemci kapsamlı kanaldan hiçbir şey almaz', () => {
    const { redis, publish } = fakeSubscriber();
    const hub = new SseHub('ui:outage', redis, 'outage:read');

    const client = fakeClient(undefined);
    hub.handle(client.req, client.res);

    publish('ui:outage', JSON.stringify({ id: 'o1', unitPath: 'TR.06' }));

    expect(dataLines(client.written)).toHaveLength(0);
  });

  it('başka bir kanalın mesajı bu hub\'a sızmaz', () => {
    const { redis, publish } = fakeSubscriber();
    const hub = new SseHub('ui:outage', redis, 'outage:read');

    const client = fakeClient(userWith({ 'outage:read': ['TR.06'] }));
    hub.handle(client.req, client.res);

    publish('ui:work-order', JSON.stringify({ id: 'w1', unitPath: 'TR.06' }));

    expect(dataLines(client.written)).toHaveLength(0);
  });
});

describe('SseHub — kapsamsız kanal', () => {
  it('çeviri ve enerjilenme sinyalleri herkese gider', () => {
    // İkisi de bölgesel değildir: çeviri sözlüğü ortak, enerjilenme mesajı kayıt kimliği
    // taşımaz (istemci kendi penceresini yeniden sorgular, o sorgu kapsamdan geçer).
    const { redis, publish } = fakeSubscriber();
    const hub = new SseHub('ui:energization', redis);

    const client = fakeClient(userWith({ 'network:read': ['TR.06.020'] }));
    hub.handle(client.req, client.res);

    publish('ui:energization', JSON.stringify({ version: 4, deEnergizedCount: 12 }));

    expect(dataLines(client.written)).toHaveLength(1);
  });
});
