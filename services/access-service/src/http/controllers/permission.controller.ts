import { asyncHandler, PERMISSIONS, requirePermission, type AuthedRequest } from '@inavitas/shared';
import { Router } from 'express';
import type { Response } from 'express';
import * as permissionRepository from '../../repository/permission.repository.ts';
import { authenticate } from '../authenticate.ts';

export function buildPermissionRouter(): Router {
  const router = Router();

  /** Tüm izinler — rol editörü bu endpoint'i kullanır. */
  router.get(
    '/',
    authenticate(),
    requirePermission(PERMISSIONS.USER_MANAGE),
    asyncHandler(async (_req: AuthedRequest, res: Response) => {
      const items = await permissionRepository.list();
      res.json({ items });
    }),
  );

  return router;
}
