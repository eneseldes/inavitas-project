import { asyncHandler, authenticateFromHeaders, PERMISSIONS, requirePermission, runReadinessChecks, type AuthedRequest } from '@inavitas/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.ts';
import { getAdmin } from '../kafka.ts';
import { redis } from '../redis.ts';
import * as outageController from './controllers/outage.controller.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Sağlık ve Hazırlık Kontrolleri ---
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'outage-service' });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const { ready, checks } = await runReadinessChecks({
        db: () => db.execute(sql`SELECT 1`),
        redis: () => redis.ping(),
        kafka: () => getAdmin().listTopics(),
      });

      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
    }),
  );

  // --- Kimlik Doğrulama Katmanı ---
  router.use(authenticateFromHeaders());

  // --- Kesinti Yönetim Uç Noktaları ---
  router.get('/outages', requirePermission(PERMISSIONS.OUTAGE_READ), asyncHandler<AuthedRequest>(outageController.list));
  // `/outages/map` `/outages/:id`'den ÖNCE tanımlanmalı, yoksa "map" bir id sanılır.
  router.get(
    '/outages/map',
    requirePermission(PERMISSIONS.OUTAGE_READ),
    asyncHandler<AuthedRequest>(outageController.listForMap),
  );
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
  router.get(
    '/outages/:id/impact',
    requirePermission(PERMISSIONS.OUTAGE_READ),
    asyncHandler<AuthedRequest>(outageController.getImpact),
  );
  router.get(
    '/outages/:id/cascade',
    requirePermission(PERMISSIONS.OUTAGE_READ),
    asyncHandler<AuthedRequest>(outageController.getCascade),
  );
  // Abone kimliği PII değildir (tesisat/sözleşme bilgisi taşımaz), o yüzden ayrı bir
  // `customer:read-pii` izni aranmaz — kesintiyi görebilen etkilenen aboneyi de görür.
  router.get(
    '/outages/:id/affected-customers',
    requirePermission(PERMISSIONS.OUTAGE_READ),
    asyncHandler<AuthedRequest>(outageController.getAffectedCustomers),
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
