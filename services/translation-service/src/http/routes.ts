import { Router } from 'express';

export function buildRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'translation-service' });
  });

  router.get('/ready', (_req, res) => {
    res.json({ status: 'ready', service: 'translation-service' });
  });

  return router;
}
