import { PERMISSIONS, scopeSignature, UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import crypto from 'node:crypto';
import type { Response } from 'express';
import { renderTile } from '../../modules/tiles/service.ts';
import { redis } from '../../redis.ts';
import { TileParams } from '../schemas.ts';

/** Tile içeriği statiktir (enerji durumu gömülmez), bu yüzden uzun süre önbelleklenebilir. */
const TILE_CACHE_TTL_SECONDS = 60 * 60;
const TILE_CONTENT_TYPE = 'application/vnd.mapbox-vector-tile';

/**
 * Anahtar kullanıcının **kapsam imzasını** taşır: aksi halde bir kullanıcının tile'ı kapsam
 * dışı başka bir kullanıcıya servis edilirdi. İmza kapsamın kendisinden türer, kullanıcı
 * kimliğinden değil — aynı kapsamdaki iki kullanıcı aynı tile'ı paylaşır. Uzun bir kapsam
 * listesi anahtarı şişirmesin diye özetlenir.
 */
function cacheKey(user: AuthedRequest['user'], z: number, x: number, y: number): string {
  const scope = crypto
    .createHash('sha1')
    .update(scopeSignature(user!, PERMISSIONS.NETWORK_READ))
    .digest('hex')
    .slice(0, 12);

  // `v4` — bkz. apps/web/src/features/map/api.ts TILE_SCHEMA_VERSION notu. Sürüm
  // istemcinin `?v=` sorgu parametresinden BAĞIMSIZDIR (Redis anahtarı sorguyu görmez);
  // MVT SQL'i (ya da zoom-lod.ts) her değiştiğinde burası da elle artırılmalı, aksi halde
  // eski tile'lar TTL dolana kadar (1 saat) servis edilmeye devam eder.
  return `network:tile:v4:${scope}:${z}:${x}:${y}`;
}

/** `GET /tiles/:z/:x/:y.mvt` — Redis cache + ETag; isteklerin çoğu DB'ye ulaşmaz. */
export async function getTile(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const { z, x, y } = TileParams.parse(req.params);
  const key = cacheKey(req.user, z, x, y);

  let buffer = await redis.getBuffer(key);

  if (!buffer) {
    buffer = await renderTile({ z, x, y }, req.user);
    await redis.set(key, buffer, 'EX', TILE_CACHE_TTL_SECONDS);
  }

  const etag = `"${crypto.createHash('sha1').update(buffer).digest('hex')}"`;

  if (req.header('if-none-match') === etag) {
    res.status(304).end();
    return;
  }

  res.set({
    'Content-Type': TILE_CONTENT_TYPE,
    'Cache-Control': `public, max-age=${TILE_CACHE_TTL_SECONDS}`,
    ETag: etag,
  });
  res.send(buffer);
}
