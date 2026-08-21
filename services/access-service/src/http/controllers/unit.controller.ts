import { asyncHandler, PERMISSIONS, requirePermission, toLimitOffset, toPageResult, type AuthedRequest } from '@inavitas/shared';
import { Router } from 'express';
import type { Response } from 'express';
import * as unitRepository from '../../repository/unit.repository.ts';
import { UnitTreeQuery } from '../schemas.ts';
import { authenticate } from '../authenticate.ts';

export function buildUnitRouter(): Router {
  const router = Router();

  /**
   * `GET /units/tree` — bir birimin doğrudan çocukları ya da ad araması.
   *
   * Birim ağacı şebeke verisidir; okuması `network:read` ile serbesttir. Yönetim
   * ekranındaki Birimler sekmesi bunun üstüne ayrıca `user:manage` ister (bkz. router).
   * Ayrı bir `unit:read` izni açılmaz — tek satırlık izin bir kokudur.
   */
  router.get(
    '/tree',
    authenticate(),
    requirePermission(PERMISSIONS.USER_MANAGE),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const query = UnitTreeQuery.parse(req.query);
      const { limit, offset } = toLimitOffset(query);

      const { items, total } = query.q
        ? await unitRepository.search(query.q, { limit, offset })
        : await unitRepository.children(query.parent, { limit, offset });

      res.json(toPageResult(items, total, query.page, query.pageSize));
    }),
  );

  return router;
}
