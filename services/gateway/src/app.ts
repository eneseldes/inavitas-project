import { correlationMiddleware, errorHandler, httpLogger, notFoundHandler, type Logger } from '@inavitas/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import { loginRateLimiter } from './auth/rate-limit.ts';
import { requireAuth, stripSpoofedHeaders } from './auth/middleware.ts';
import { config, SERVICE_TARGETS } from './config.ts';
import { buildProxy } from './proxy.ts';
import { redis, redisSubscriber } from './redis.ts';
import { createSseHubs } from './realtime/sse.ts';

/** Kimlik doğrulama gerektirmeyen (herkese açık) rotalar. */
const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/auth/refresh', '/api/auth/logout']);

/** Express Gateway uygulamasını ve rota yönlendirmelerini yapılandırır. */
export function createApp(logger: Logger): Express {
  const app = express();

  app.set('trust proxy', true);

  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(correlationMiddleware());
  app.use(httpLogger(logger));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'gateway' });
  });

  // Sahte header temizleme ve kimlik doğrulama kontrolleri
  app.use(stripSpoofedHeaders());
  app.post('/api/auth/login', loginRateLimiter(redis));

  app.use((req, res, next) => {
    if (PUBLIC_PATHS.has(req.path)) {
      next();
      return;
    }
    requireAuth()(req, res, next);
  });

  // Canlı arayüz akışları (SSE) — Redis pub/sub'dan gelen mesajları doğrudan
  // gateway dağıtır, downstream servislere proxy edilmez (Faz 5 adım 3-4).
  const sseHubs = createSseHubs(redisSubscriber);
  app.get('/api/outages/stream', (req, res) => sseHubs.outage.handle(req, res));
  app.get('/api/work-orders/stream', (req, res) => sseHubs.workOrder.handle(req, res));

  // Downstream servis proxy yönlendirmeleri
  app.use(buildProxy('/api/auth/**', SERVICE_TARGETS.access, { '^/api/auth': '/auth' }));
  app.use(buildProxy('/api/users/**', SERVICE_TARGETS.access, { '^/api/users': '/users' }));
  app.use(buildProxy('/api/outages/**', SERVICE_TARGETS.outage, { '^/api/outages': '/outages' }));
  app.use(buildProxy('/api/work-orders/**', SERVICE_TARGETS.workOrder, { '^/api/work-orders': '/work-orders' }));

  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return app;
}
