import { asyncHandler, authenticateFromHeaders, PERMISSIONS, requirePermission, runReadinessChecks, type AuthedRequest } from '@inavitas/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.ts';
import { getAdmin } from '../kafka.ts';
import { redis } from '../redis.ts';
import * as workOrderController from './controllers/work-order.controller.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Sağlık ve Hazırlık Kontrolleri ---
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'work-order-service' });
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

  // --- İş Emri Yönetim Uç Noktaları ---
  router.get(
    '/work-orders',
    requirePermission(PERMISSIONS.WORKORDER_READ),
    asyncHandler<AuthedRequest>(workOrderController.list),
  );
  // `/work-orders/map` `/work-orders/:id`'den ÖNCE tanımlanmalı, yoksa "map" bir id sanılır.
  router.get(
    '/work-orders/map',
    requirePermission(PERMISSIONS.WORKORDER_READ),
    asyncHandler<AuthedRequest>(workOrderController.listForMap),
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
