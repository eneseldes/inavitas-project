import {
  asyncHandler,
  authenticateFromHeaders,
  PERMISSIONS,
  requirePermission,
  runReadinessChecks,
  type AuthedRequest,
} from '@inavitas/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.ts';
import { getAdmin } from '../kafka.ts';
import { redis } from '../redis.ts';
import * as controller from './controllers/translation.controller.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Healthcheck ---
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'translation-service' });
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

  // --- PUBLIC ENDPOINTS (authenticateFromHeaders öncesi) ---
  router.get('/translations/bundle', asyncHandler(controller.getBundle));
  router.get('/translations/locales', asyncHandler(controller.getLocales));

  // --- KORUMALI ENDPOINTS (authenticateFromHeaders sonrası) ---
  router.use(authenticateFromHeaders());

  router.post(
    '/translations/locales',
    requirePermission(PERMISSIONS.TRANSLATION_PUBLISH),
    asyncHandler<AuthedRequest>(controller.createLocale),
  );

  router.get(
    '/translations/provider-languages',
    requirePermission(PERMISSIONS.TRANSLATION_PUBLISH),
    asyncHandler<AuthedRequest>(controller.getProviderLanguagesHandler),
  );

  router.patch(
    '/translations/locales/:code',
    requirePermission(PERMISSIONS.TRANSLATION_PUBLISH),
    asyncHandler<AuthedRequest>(controller.updateLocale),
  );

  router.get(
    '/translations/namespaces',
    requirePermission(PERMISSIONS.TRANSLATION_READ),
    asyncHandler<AuthedRequest>(controller.getNamespaces),
  );

  router.get(
    '/translations/keys',
    requirePermission(PERMISSIONS.TRANSLATION_READ),
    asyncHandler<AuthedRequest>(controller.listKeys),
  );

  router.post(
    '/translations/keys',
    requirePermission(PERMISSIONS.TRANSLATION_WRITE),
    asyncHandler<AuthedRequest>(controller.createKey),
  );

  router.put(
    '/translations/keys/:id/translations',
    requirePermission(PERMISSIONS.TRANSLATION_WRITE),
    asyncHandler<AuthedRequest>(controller.updateTranslation),
  );

  router.delete(
    '/translations/keys/:id',
    requirePermission(PERMISSIONS.TRANSLATION_PUBLISH),
    asyncHandler<AuthedRequest>(controller.deleteKey),
  );

  router.post(
    '/translations/auto-translate',
    requirePermission(PERMISSIONS.TRANSLATION_WRITE),
    asyncHandler<AuthedRequest>(controller.autoTranslate),
  );

  router.post(
    '/translations/publish',
    requirePermission(PERMISSIONS.TRANSLATION_PUBLISH),
    asyncHandler<AuthedRequest>(controller.publish),
  );

  return router;
}
