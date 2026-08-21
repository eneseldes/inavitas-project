import {
  PERMISSIONS,
  scopeFilterAnyUnit,
  toPageResult,
  UnauthenticatedError,
  ValidationError,
  type AuthedRequest,
} from '@inavitas/shared';
import type { Response } from 'express';
import { components } from '../../db/schema.ts';
import { areaQuerySeconds } from '../../metrics.ts';
import { registerHighlightSet } from '../../modules/highlight/sets.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import { toComponentAreaDto } from '../dto.ts';
import { QueryWithinBody } from '../schemas.ts';

/**
 * Haritada çizilen alanın içine düşen şebeke elemanlarını listeler.
 *
 * Kesinti ve iş emri kayıtları bu uçtan dönmez: onların konumu kendi servislerinin
 * read-model'inde durur ve servisler birbirini senkron HTTP ile çağırmaz. O iki katman
 * zaten harita için istemcide bulunduğundan alan süzmesi orada yapılır.
 */
export async function within(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const body = QueryWithinBody.parse(req.body);

  const { usable, reason } = await componentsRepository.checkSearchArea(body.polygon);
  if (!usable) {
    throw new ValidationError('Seçilen alan geçerli bir poligon değil', [
      { field: 'polygon', issue: reason ?? 'onarılamayan geometri' },
    ]);
  }

  const scope = scopeFilterAnyUnit(req.user, components.unitPath, components.unitPaths, PERMISSIONS.NETWORK_READ);
  const pagination = { page: body.page, pageSize: body.pageSize };

  const filters = {
    type: body.type,
    category: body.category,
    breakerRole: body.breakerRole,
    voltageLevel: body.voltageLevel,
    q: body.q,
    scope,
  };

  // Sayfa ve vurgu kümesi birlikte hesaplanır: liste bir sayfa gösterir ama haritada alanın
  // TAMAMI vurgulanmalı — kullanıcı hangi sayfada olursa olsun seçtiği alan aynı alandır.
  const done = areaQuerySeconds.startTimer();
  const [{ items, total, overflowed }, ids] = await Promise.all([
    componentsRepository.listWithin(body.polygon, filters, pagination),
    componentsRepository.listWithinIds(body.polygon, filters),
  ]);
  // Üst sınıra dayanan sorgu farklı bir maliyet eğrisidir; ayrı etiketlenmezse p95 karışır.
  done({ overflowed: String(overflowed) });

  const set = await registerHighlightSet(req.user, [{ role: 'area', ids }]);

  res.json({
    ...toPageResult(items.map(toComponentAreaDto), total, body.page, body.pageSize),
    // Sonuç üst sınıra dayandı: sayı da liste de eksiktir, kullanıcıya alanı daraltması söylenir.
    overflowed,
    setToken: set?.token ?? null,
    setTruncated: set?.truncated ?? false,
  });
}
