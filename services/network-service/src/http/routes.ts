import { asyncHandler, authenticateFromHeaders, PERMISSIONS, requirePermission, runReadinessChecks, type AuthedRequest } from '@inavitas/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.ts';
import { isGraphLoaded } from '../graph/loader.ts';
import { getAdmin } from '../kafka.ts';
import { redis } from '../redis.ts';
import * as componentsController from './controllers/components.controller.ts';
import * as customersController from './controllers/customers.controller.ts';
import * as impactController from './controllers/impact.controller.ts';
import * as tilesController from './controllers/tiles.controller.ts';
import * as unitsController from './controllers/units.controller.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Sağlık ve Hazırlık Kontrolleri ---
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'network-service' });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const { ready, checks } = await runReadinessChecks({
        db: () => db.execute(sql`SELECT 1`),
        redis: () => redis.ping(),
        kafka: () => getAdmin().listTopics(),
        graph: () => (isGraphLoaded() ? Promise.resolve() : Promise.reject(new Error('graf henüz yüklenmedi'))),
      });

      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
    }),
  );

  // --- Kimlik Doğrulama Katmanı ---
  router.use(authenticateFromHeaders());

  // Gateway `/api/network/**` isteklerini `/network/**` olarak bu servise yönlendirir
  // (bkz. services/gateway/src/app.ts pathRewrite) — uç noktalar bu yüzden `/network` altındadır.
  const networkRouter = Router();

  // --- İdari Birim Uç Noktaları ---
  networkRouter.get(
    '/units',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(unitsController.list),
  );
  networkRouter.get(
    '/units/:path',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(unitsController.getByPath),
  );
  networkRouter.get(
    '/units/:path/children',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(unitsController.getChildren),
  );

  // --- Şebeke Elemanı Uç Noktaları ---
  networkRouter.get(
    '/components',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(componentsController.list),
  );
  networkRouter.get(
    '/components/:id',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(componentsController.getById),
  );
  networkRouter.get(
    '/components/:id/children',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(componentsController.getChildren),
  );
  networkRouter.get(
    '/components/:id/customers',
    requirePermission(PERMISSIONS.CUSTOMER_READ),
    asyncHandler<AuthedRequest>(customersController.getByComponent),
  );
  networkRouter.get(
    '/components/:id/trace',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(impactController.trace),
  );
  networkRouter.get(
    '/components/:id/impact-preview',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(impactController.impactPreview),
  );

  // --- Vector Tile Uç Noktası ---
  networkRouter.get(
    '/tiles/:z/:x/:y.mvt',
    requirePermission(PERMISSIONS.NETWORK_READ),
    asyncHandler<AuthedRequest>(tilesController.getTile),
  );

  // --- Abone Uç Noktaları ---
  networkRouter.get(
    '/customers',
    requirePermission(PERMISSIONS.CUSTOMER_READ),
    asyncHandler<AuthedRequest>(customersController.list),
  );
  networkRouter.get(
    '/customers/:id',
    requirePermission(PERMISSIONS.CUSTOMER_READ),
    asyncHandler<AuthedRequest>(customersController.getById),
  );
  networkRouter.get(
    '/customers/:id/pii',
    requirePermission(PERMISSIONS.CUSTOMER_READ_PII),
    asyncHandler<AuthedRequest>(customersController.getPii),
  );

  router.use('/network', networkRouter);

  return router;
}
