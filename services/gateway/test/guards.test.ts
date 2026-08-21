import { SCOPES_HEADER_NAME } from '@inavitas/shared';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { isScopeStale, SPOOFABLE_HEADERS, stripSpoofedHeaders } from '../src/auth/guards.ts';

/**
 * Faz 9'un güvenlik testlerinden ikisinin otomatik karşılığı:
 * - "`x-user-scopes` dışarıdan enjekte edilemiyor"
 * - "Kapsam daraltma sonrası eski token `SCOPE_STALE` ile reddediliyor"
 *
 * Bu iki karar tüm bölgesel yetki modelinin dayandığı yerdir: alt servisler kimliği ve
 * kapsamı header'dan okuyor, JWT çözmüyor — kimlik yalnız gateway'de doğrulanır.
 */

function runStrip(headers: Record<string, unknown>): Record<string, unknown> {
  const req = { headers } as unknown as Request;
  stripSpoofedHeaders()(req, {} as Response, vi.fn() as unknown as NextFunction);
  return req.headers as Record<string, unknown>;
}

describe('stripSpoofedHeaders', () => {
  it('kapsam header\'ı dışarıdan enjekte edilemez', () => {
    // 🚨 Bu satır atlanırsa saldırgan kendine tüm Ankara kapsamını yazar ve yetki modeli
    // baştan sona delinir — alt servisler bu header'a bakarak süzüyor.
    const headers = runStrip({ [SCOPES_HEADER_NAME]: '{"outage:write":["TR.06"]}' });

    expect(headers[SCOPES_HEADER_NAME]).toBeUndefined();
  });

  it('kimlik ve izin header\'ları da temizlenir', () => {
    const headers = runStrip({
      'x-user-id': 'sahte',
      'x-user-email': 'admin@inavitas.com',
      'x-user-roles': 'ADMIN',
      'x-user-permissions': 'user:manage',
      [SCOPES_HEADER_NAME]: '{}',
    });

    for (const header of SPOOFABLE_HEADERS) expect(headers[header]).toBeUndefined();
  });

  it('ilgisiz header\'lara dokunmaz', () => {
    const headers = runStrip({ 'x-correlation-id': 'abc', cookie: 'access_token=…' });

    expect(headers['x-correlation-id']).toBe('abc');
    expect(headers.cookie).toBe('access_token=…');
  });

  it('taklit edilebilir header listesi kapsamı içerir', () => {
    // Liste büyürse (yeni bir `x-user-*` eklenirse) bu test kendiliğinden yetmez; ama
    // kapsamın listeden DÜŞMESİ sessiz kalmasın diye açıkça yazılı.
    expect(SPOOFABLE_HEADERS).toContain(SCOPES_HEADER_NAME);
  });
});

describe('isScopeStale', () => {
  it('kapsam daraltıldıktan sonra eski token bayattır', () => {
    // access-service kapsam değişince Redis'teki sürümü artırır; elindeki token hâlâ eski
    // sürümü taşıyan kullanıcı 15 dakika boyunca geniş kapsamla dolaşamamalı.
    expect(isScopeStale('3', 2)).toBe(true);
  });

  it('sürüm eşleşiyorsa token geçerlidir', () => {
    expect(isScopeStale('3', 3)).toBe(false);
  });

  it('sürüm kaydı hiç yoksa token kabul edilir', () => {
    // Redis'in boşalması (TTL, restart) herkesi dışarı atmamalı: kayıt yokluğu "kapsam hiç
    // değişmedi" demektir.
    expect(isScopeStale(null, 2)).toBe(false);
    expect(isScopeStale(null, undefined)).toBe(false);
  });

  it('sürümü olmayan (eski biçim) token, sürüm kaydı varken reddedilir', () => {
    expect(isScopeStale('1', undefined)).toBe(true);
  });

  it('sürümü ileri yazılmış token da bayattır', () => {
    // Karşılaştırma eşitliktir, "büyüktür" değil — uydurulmuş bir sürüm kapıyı açmamalı.
    expect(isScopeStale('2', 99)).toBe(true);
  });
});
