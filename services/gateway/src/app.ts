import { asyncHandler, correlationMiddleware, errorHandler, httpLogger, notFoundHandler, runReadinessChecks, type Logger } from '@inavitas/shared';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { bundleRateLimiter, loginRateLimiter } from './auth/rate-limit.ts';
import { requireAuth, stripSpoofedHeaders, verifyCsrf } from './auth/middleware.ts';
import { config, SERVICE_TARGETS } from './config.ts';
import { buildProxy } from './proxy.ts';
import { redis, redisSubscriber } from './redis.ts';
import { createSseHubs } from './realtime/sse.ts';

function isPublicPath(req: express.Request): boolean {
  if (req.method === 'GET' && (req.path === '/api/translations/bundle' || req.path === '/api/translations/locales')) {
    return true;
  }
  return req.path === '/api/auth/login' || req.path === '/api/auth/refresh' || req.path === '/api/auth/logout';
}

/** Login'de henüz CSRF çerezi kurulmadığından muaf; diğer tüm mutasyonlar korunur. */
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login']);

/** Express Gateway uygulamasını ve rota yönlendirmelerini yapılandırır. */
export function createApp(logger: Logger): Express {
  const app = express();

  app.set('trust proxy', true);

  const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', config.CORS_ORIGIN]);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
    }),
  );
  app.use(correlationMiddleware());
  app.use(httpLogger(logger));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'gateway' });
  });

  app.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const { ready, checks } = await runReadinessChecks({ redis: () => redis.ping() });
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
    }),
  );

  // Sahte header temizleme ve kimlik doğrulama kontrolleri
  app.use(stripSpoofedHeaders());
  app.post('/api/auth/login', loginRateLimiter(redis));
  app.use('/api/translations/bundle', bundleRateLimiter(redis));
  app.use('/api/translations/locales', bundleRateLimiter(redis));

  app.use((req, res, next) => {
    if (CSRF_EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    verifyCsrf()(req, res, next);
  });

  app.use((req, res, next) => {
    if (isPublicPath(req)) {
      next();
      return;
    }
    requireAuth()(req, res, next);
  });

  // Canlı arayüz akışları (SSE): Redis pub/sub'dan gelen mesajlar doğrudan gateway tarafından dağıtılır.
  const sseHubs = createSseHubs(redisSubscriber);
  app.get('/api/outages/stream', (req, res) => sseHubs.outage.handle(req, res));
  app.get('/api/work-orders/stream', (req, res) => sseHubs.workOrder.handle(req, res));
  app.get('/api/translations/stream', (req, res) => sseHubs.translation.handle(req, res));

  // outage/work-order/translation servislerine Cookie header'ı iletilmez (yalnızca x-user-* güvenilir).
  app.use(buildProxy('/api/auth/**', SERVICE_TARGETS.access, { '^/api/auth': '/auth' }));
  app.use(buildProxy('/api/users/**', SERVICE_TARGETS.access, { '^/api/users': '/users' }));
  app.use(buildProxy('/api/outages/**', SERVICE_TARGETS.outage, { '^/api/outages': '/outages' }, { forwardCookies: false }));
  app.use(
    buildProxy('/api/work-orders/**', SERVICE_TARGETS.workOrder, { '^/api/work-orders': '/work-orders' }, { forwardCookies: false }),
  );
  app.use(
    buildProxy('/api/translations/**', SERVICE_TARGETS.translation, { '^/api/translations': '/translations' }, { forwardCookies: false }),
  );


  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return app;
}
