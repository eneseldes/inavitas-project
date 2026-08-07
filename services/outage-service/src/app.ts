import { correlationMiddleware, errorHandler, httpLogger, notFoundHandler, type Logger } from '@edas/shared';
import express, { type Express } from 'express';
import { buildRouter } from './http/routes.ts';

/**
 * Express uygulamasını kurar — ama dinlemez (bkz. access-service/src/app.ts
 * için aynı gerekçe: `listen`i index.ts'e bırakmak testlerin supertest ile
 * gerçek port açmadan çalışmasını sağlar).
 */
export function createApp(logger: Logger): Express {
  const app = express();

  app.set('trust proxy', true);

  app.use(correlationMiddleware());
  app.use(httpLogger(logger));
  app.use(express.json({ limit: '100kb' }));

  app.use(buildRouter());

  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return app;
}

