import { NotFoundError, PERMISSIONS, scopeSignature, UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import crypto from 'node:crypto';
import type { Response } from 'express';
import { tileCacheTotal, tileRenderSeconds } from '../../metrics.ts';
import { readHighlightSet, scopeHashOf } from '../../modules/highlight/sets.ts';
import { renderHighlightTile } from '../../modules/highlight/tile.ts';
import { renderTile, TILE_SCHEMA_VERSION } from '../../modules/tiles/service.ts';
import { redis } from '../../redis.ts';
import { HighlightTileParams, TileParams, TileQuery } from '../schemas.ts';

/** Tile içeriği statiktir (enerji durumu gömülmez), bu yüzden uzun süre önbelleklenebilir. */
const TILE_CACHE_TTL_SECONDS = 60 * 60;

/** Vurgu tile'ı kümenin kendisiyle aynı ömre sahiptir (bkz. highlight/sets.ts SET_TTL_SECONDS). */
const HIGHLIGHT_TILE_TTL_SECONDS = 15 * 60;
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

  // Sürüm artık burada elle yazılmaz: MVT şemasını üreten dosyanın kendi sabitinden gelir
  // (bkz. modules/tiles/service.ts `TILE_SCHEMA_VERSION`). İstemcinin `?v=` parametresi
  // anahtara GİRMEZ — girseydi istemci uydurduğu her sürümle sunucuda yeni bir anahtar
  // uzayı açabilirdi.
  return `network:tile:v${TILE_SCHEMA_VERSION}:${scope}:${z}:${x}:${y}`;
}

/** `GET /tiles/:z/:x/:y.mvt` — Redis cache + ETag; isteklerin çoğu DB'ye ulaşmaz. */
export async function getTile(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const { z, x, y } = TileParams.parse(req.params);

  // İstemcinin beklediği şema sürümü sunucununkinden farklıysa taraflardan biri bayat
  // demektir: ya dağıtım yarım kalmış, ya iki sabitten biri artırılmayı unutulmuş. İstek
  // reddedilmez (dağıtım penceresinde açık duran bir sekme haritayı kaybetmemeli) ama
  // sessiz de kalmaz — eskiden bu ayrışmanın hiçbir izi yoktu.
  const { v } = TileQuery.parse(req.query);
  if (v !== undefined && v !== TILE_SCHEMA_VERSION) {
    req.log?.warn(
      { clientVersion: v, serverVersion: TILE_SCHEMA_VERSION },
      'tile şema sürümü uyuşmuyor — istemci ve sunucu sabitlerinden biri güncellenmemiş',
    );
  }

  const key = cacheKey(req.user, z, x, y);

  // Süre cache okumasını DA kapsar: kullanıcının gördüğü gecikme budur, yalnız `ST_AsMVT`
  // değil. Kabul ölçütündeki "cache-hit < 30 ms" ancak böyle ölçülebilir.
  const done = tileRenderSeconds.startTimer();
  let buffer = await redis.getBuffer(key);
  const source = buffer ? 'hit' : 'miss';

  if (!buffer) {
    buffer = await renderTile({ z, x, y }, req.user);
    await redis.set(key, buffer, 'EX', TILE_CACHE_TTL_SECONDS);
  }

  done({ layer: 'network', source });
  tileCacheTotal.inc({ layer: 'network', source });

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

/**
 * `GET /tiles/set/:token/:z/:x/:y.mvt` — vurgu kümesinin tile'ı.
 *
 * Ana tile'dan iki farkı var:
 * - **TTL kısa** (15 dk): küme geçicidir, ana tile gibi bir saat tutulmaz.
 * - **Token yoksa 410 Gone**: küme Redis'ten düşmüştür; istemci sorguyu yenileyip yeni bir
 *   token alır (sessizce boş tile dönmek, "iz kayboldu" gibi görünürdü).
 *
 * Kapsam iki kez uygulanır — token kapsam özetini taşır (yanlış kapsam 404) **ve** tile SQL'i
 * ayrıca süzer. Token tahmin edilebilir bir özet olduğu için tek başına yetki taşımamalı.
 */
export async function getHighlightTile(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const { token, z, x, y } = HighlightTileParams.parse(req.params);
  const key = `network:hltile:${token}:${z}:${x}:${y}`;

  const done = tileRenderSeconds.startTimer();
  let buffer = await redis.getBuffer(key);
  const source = buffer ? 'hit' : 'miss';

  if (!buffer) {
    const set = await readHighlightSet(token);
    if (!set) {
      res.status(410).json({ error: { code: 'HIGHLIGHT_SET_EXPIRED', message: 'Vurgu kümesi zaman aşımına uğradı' } });
      return;
    }
    if (set.scopeHash !== scopeHashOf(req.user)) throw new NotFoundError('Vurgu kümesi', token);

    buffer = await renderHighlightTile({ z, x, y }, set, req.user);
    await redis.set(key, buffer, 'EX', HIGHLIGHT_TILE_TTL_SECONDS);
  }

  done({ layer: 'highlight', source });
  tileCacheTotal.inc({ layer: 'highlight', source });

  const etag = `"${crypto.createHash('sha1').update(buffer).digest('hex')}"`;

  if (req.header('if-none-match') === etag) {
    res.status(304).end();
    return;
  }

  res.set({
    'Content-Type': TILE_CONTENT_TYPE,
    // `private`: token kullanıcının kapsamına bağlıdır, paylaşılan bir ara önbelleğe düşmemeli.
    'Cache-Control': `private, max-age=${HIGHLIGHT_TILE_TTL_SECONDS}`,
    ETag: etag,
  });
  res.send(buffer);
}
