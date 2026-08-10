import {
  asyncHandler,
  authenticateFromHeaders,
  PERMISSIONS,
  requirePermission,
} from '@inavitas/shared';
import { Router } from 'express';
import * as controller from './controllers/translation.controller.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Healthcheck ---
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'translation-service' });
  });

  router.get('/ready', (_req, res) => {
    res.json({ status: 'ready', service: 'translation-service' });
  });

  // --- PUBLIC ENDPOINTS (authenticateFromHeaders öncesi) ---
  router.get('/translations/bundle', asyncHandler(controller.getBundle));
  router.get('/translations/locales', asyncHandler(controller.getLocales));

  // --- KORUMALI ENDPOINTS (authenticateFromHeaders sonrası) ---
  router.use(authenticateFromHeaders());

  router.post(
    '/translations/locales',
    requirePermission(PERMISSIONS.TRANSLATION_PUBLISH),
    asyncHandler(controller.createLocale),
  );

  router.get(
    '/translations/namespaces',
    requirePermission(PERMISSIONS.TRANSLATION_READ),
    asyncHandler(controller.getNamespaces),
  );

  router.get(
    '/translations/keys',
    requirePermission(PERMISSIONS.TRANSLATION_READ),
    asyncHandler(controller.listKeys),
  );

  router.post(
    '/translations/keys',
    requirePermission(PERMISSIONS.TRANSLATION_WRITE),
    asyncHandler(controller.createKey),
  );

  router.put(
    '/translations/keys/:id/translations',
    requirePermission(PERMISSIONS.TRANSLATION_WRITE),
    asyncHandler(controller.updateTranslation),
  );

  router.post(
    '/translations/publish',
    requirePermission(PERMISSIONS.TRANSLATION_PUBLISH),
    asyncHandler(controller.publish),
  );

  return router;
}
