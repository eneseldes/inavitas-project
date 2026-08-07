import { correlationMiddleware, errorHandler, httpLogger, notFoundHandler, type Logger } from '@inavitas/shared';
import express, { type Express } from 'express';
import { buildRouter } from './http/routes.ts';

/**
 * Express uygulamasını kurar — ama dinlemez.
 *
 * `listen` çağrısını index.ts'e bırakmak testlerin supertest ile gerçek port
 * açmadan çalışmasını sağlar.
 *
 * ⚠️ Middleware SIRASI burada anlamlıdır, alfabetik veya rastgele değil:
 * correlationId her logda görünsün diye en başta, hata yakalayıcı her şeyi
 * görebilsin diye en sonda.
 */
export function createApp(logger: Logger): Express {
  const app = express();

  // Gateway arkasında çalışacağız; istemcinin gerçek IP'si X-Forwarded-For'da.
  // Rate limiting (Faz 5) doğru IP'yi görmezse tüm kullanıcıları tek IP sanar.
  app.set('trust proxy', true);

  app.use(correlationMiddleware());
  app.use(httpLogger(logger));
  app.use(express.json({ limit: '100kb' }));

  app.use(buildRouter());

  // 404 ve hata yakalayıcı EN SONDA: önce tüm route'lar denensin.
  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return app;
}

