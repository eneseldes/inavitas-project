import { asyncHandler, authenticateFromHeaders, PERMISSIONS, requirePermission, type AuthedRequest } from '@inavitas/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.ts';
import * as outageController from './controllers/outage.controller.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Sağlık kontrolleri --- (auth gerektirmez)
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'outage-service' });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ready' });
    }),
  );

  // Bu noktadan sonraki her route kimlik ister. access-service'in aksine JWT'yi
  // KENDİMİZ doğrulamıyoruz — gateway'in eklediği X-User-* header'larına
  // güveniyoruz (Faz 3'e kadar bu header'ları testte elle ekliyorsun).
  router.use(authenticateFromHeaders());

  router.get('/outages', requirePermission(PERMISSIONS.OUTAGE_READ), asyncHandler<AuthedRequest>(outageController.list));
  router.get(
    '/outages/:id',
    requirePermission(PERMISSIONS.OUTAGE_READ),
    asyncHandler<AuthedRequest>(outageController.getById),
  );
  router.get(
    '/outages/:id/history',
    requirePermission(PERMISSIONS.OUTAGE_READ),
    asyncHandler<AuthedRequest>(outageController.getHistory),
  );
  router.post(
    '/outages',
    requirePermission(PERMISSIONS.OUTAGE_WRITE),
    asyncHandler<AuthedRequest>(outageController.create),
  );

  router.patch(
    '/outages/:id',
    requirePermission(PERMISSIONS.OUTAGE_WRITE),
    asyncHandler<AuthedRequest>(outageController.patch),
  );

  return router;
}
