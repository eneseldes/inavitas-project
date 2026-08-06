import { correlationMiddleware, errorHandler, notFoundHandler, type Logger } from '@edas/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import { requireAuth, stripSpoofedHeaders } from './auth/middleware.ts';
import { config, SERVICE_TARGETS } from './config.ts';
import { buildProxy } from './proxy.ts';

/**
 * JWT gerektirmeyen tek üç uç: token almanın (login), yenilemenin (refresh)
 * ve iptal etmenin (logout) yolları. access-service/src/http/routes.ts'te
 * bu üçü de `authenticate()` middleware'i TAŞIMIYOR — logout'u burada da
 * public bırakmazsak süresi dolmuş bir access token'la çıkış yapamaz hale
 * gelirsin (refreshToken zaten kendi başına yeterli kimlik kanıtı).
 */
const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/auth/refresh', '/api/auth/logout']);

export function createApp(logger: Logger): Express {
  const app = express();

  app.set('trust proxy', true);

  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(correlationMiddleware());

  // ⚠️ express.json() BİLEREK YOK. Burada gövdeyi parse edip tüketirsek,
  // http-proxy-middleware downstream'e boş/bozuk bir body iletir — klasik
  // gateway tuzağı. Gateway gövdeye hiç dokunmuyor, olduğu gibi akıtıyor;
  // parse işini zaten yapması gereken servis (access/outage/work-order) yapar.

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'gateway' });
  });

  // SIRA kritik: önce sil (spoofing koruması), sonra doğrula/yaz.
  app.use(stripSpoofedHeaders());

  app.use((req, res, next) => {
    if (PUBLIC_PATHS.has(req.path)) {
      next();
      return;
    }
    requireAuth()(req, res, next);
  });

  // Kökte mount ediliyor (path argümanı YOK) — bkz. proxy.ts'teki
  // pathFilter/pathRewrite gerekçesi.
  app.use(buildProxy('/api/auth/**', SERVICE_TARGETS.access, { '^/api/auth': '/auth' }));
  app.use(buildProxy('/api/users/**', SERVICE_TARGETS.access, { '^/api/users': '/users' }));
  app.use(buildProxy('/api/outages/**', SERVICE_TARGETS.outage, { '^/api/outages': '/outages' }));
  app.use(buildProxy('/api/work-orders/**', SERVICE_TARGETS.workOrder, { '^/api/work-orders': '/work-orders' }));

  app.use(notFoundHandler());
  app.use(errorHandler(logger));

  return app;
}
