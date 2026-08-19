import { toPageResult, UnauthenticatedError, ValidationError, type AuthedRequest } from '@inavitas/shared';
import type { Response } from 'express';
import { components } from '../../db/schema.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import { toComponentAreaDto } from '../dto.ts';
import { QueryWithinBody } from '../schemas.ts';
import { scopeFilter } from '../scope-filter.ts';

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

  const scope = scopeFilter(req.user, components.unitPath);
  const pagination = { page: body.page, pageSize: body.pageSize };

  const { items, total, overflowed } = await componentsRepository.listWithin(
    body.polygon,
    {
      type: body.type,
      category: body.category,
      breakerRole: body.breakerRole,
      voltageLevel: body.voltageLevel,
      q: body.q,
      scope,
    },
    pagination,
  );

  res.json({
    ...toPageResult(items.map(toComponentAreaDto), total, body.page, body.pageSize),
    // Sonuç üst sınıra dayandı: sayı da liste de eksiktir, kullanıcıya alanı daraltması söylenir.
    overflowed,
  });
}
