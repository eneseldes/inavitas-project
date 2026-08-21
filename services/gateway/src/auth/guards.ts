/**
 * Gateway'in kimlik/kapsam bütünlüğü kapıları — **saf**, I/O'suz ve bu yüzden test edilebilir.
 *
 * Bu iki karar Faz 9'un en kritik satırlarıdır ve `middleware.ts` içinde Redis'e bağlı bir
 * modülün ortasında duruyorlardı; oradan otomatik test yazmak Redis bağlantısı açmadan
 * mümkün değildi. Karar burada, kararın uygulandığı yer `middleware.ts`'te.
 */

import { SCOPES_HEADER_NAME } from '@inavitas/shared';
import type { NextFunction, Request, Response } from 'express';

/**
 * 🚨 `x-user-scopes` bu listede olmak ZORUNDA. Atlanırsa header dışarıdan enjekte edilir
 * ve tüm bölgesel yetki modeli delinir — süzme kararını alt servisler bu header'a bakarak
 * veriyor. Aynı şey kimlik ve izin header'ları için de geçerlidir: gateway'in doğruladığı
 * ne varsa istemci de yazabilir olmamalı.
 */
export const SPOOFABLE_HEADERS = [
  'x-user-id',
  'x-user-email',
  'x-user-roles',
  'x-user-permissions',
  SCOPES_HEADER_NAME,
] as const;

/** Dışarıdan gelen sahte `X-User-*` header'larını temizler. */
export function stripSpoofedHeaders() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const header of SPOOFABLE_HEADERS) delete req.headers[header];
    next();
  };
}

/**
 * Token'daki kapsam sürümü bayat mı.
 *
 * Sürüm kaydı Redis'tedir çünkü gateway veritabanına bağlanmaz. Kayıt hiç yoksa kapsam o
 * kullanıcı için henüz hiç değişmemiştir (ya da TTL dolmuştur) — token kabul edilir; aksi
 * halde Redis'in boşalması herkesi dışarı atardı.
 *
 * ⚠️ Karşılaştırma **eşitlik**tir, "büyüktür" değil: sürümü ileri yazılmış (uydurulmuş) bir
 * token da bayattır.
 */
export function isScopeStale(storedVersion: string | null, tokenVersion: number | undefined): boolean {
  if (storedVersion === null) return false;
  return Number(storedVersion) !== tokenVersion;
}
