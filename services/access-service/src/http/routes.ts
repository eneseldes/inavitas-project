import { asyncHandler, runReadinessChecks } from '@inavitas/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.ts';
import { redis } from '../redis.ts';
import * as authController from './controllers/auth.controller.ts';
import { buildPermissionRouter } from './controllers/permission.controller.ts';
import { buildRoleRouter } from './controllers/role.controller.ts';
import { buildUserRouter } from './controllers/user.controller.ts';
import { authenticate } from './authenticate.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Sağlık ve Hazırlık Kontrolleri ---
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'access-service' });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const { ready, checks } = await runReadinessChecks({
        db: () => db.execute(sql`SELECT 1`),
        redis: () => redis.ping(),
      });

      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
    }),
  );

  // --- Kimlik Doğrulama Uç Noktaları ---
  router.post('/auth/login', asyncHandler(authController.login));
  router.post('/auth/refresh', asyncHandler(authController.refresh));
  router.post('/auth/logout', asyncHandler(authController.logout));
  router.get('/auth/me', authenticate(), asyncHandler(authController.me));

  // --- Yönetim Uç Noktaları ---
  router.use('/users', buildUserRouter());
  router.use('/roles', buildRoleRouter());
  router.use('/permissions', buildPermissionRouter());

  return router;
}
