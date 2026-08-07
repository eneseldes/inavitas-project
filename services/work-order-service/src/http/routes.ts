import { asyncHandler, authenticateFromHeaders, PERMISSIONS, requirePermission, type AuthedRequest } from '@inavitas/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.ts';
import * as workOrderController from './controllers/work-order.controller.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Sağlık kontrolleri --- (auth gerektirmez)
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'work-order-service' });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ready' });
    }),
  );

  // Bu noktadan sonraki her route kimlik ister — gateway'in eklediği
  // X-User-* header'larına güveniyoruz (bkz. outage-service/src/http/routes.ts).
  router.use(authenticateFromHeaders());

  router.get(
    '/work-orders',
    requirePermission(PERMISSIONS.WORKORDER_READ),
    asyncHandler<AuthedRequest>(workOrderController.list),
  );
  router.get(
    '/work-orders/:id',
    requirePermission(PERMISSIONS.WORKORDER_READ),
    asyncHandler<AuthedRequest>(workOrderController.getById),
  );
  router.get(
    '/work-orders/:id/history',
    requirePermission(PERMISSIONS.WORKORDER_READ),
    asyncHandler<AuthedRequest>(workOrderController.getHistory),
  );
  router.post(
    '/work-orders',
    requirePermission(PERMISSIONS.WORKORDER_WRITE),
    asyncHandler<AuthedRequest>(workOrderController.create),
  );

  router.patch(
    '/work-orders/:id',
    requirePermission(PERMISSIONS.WORKORDER_WRITE),
    asyncHandler<AuthedRequest>(workOrderController.patch),
  );

  return router;
}
