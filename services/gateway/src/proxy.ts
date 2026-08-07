import type { AuthedRequest } from '@inavitas/shared';
import type { RequestHandler } from 'express';
import { createProxyMiddleware, type Options } from 'http-proxy-middleware';

/**
 * Bir downstream servise proxy kurar ve doğrulanmış kimliği
 * `X-User-*`/`X-Correlation-Id` header'larına yazar.
 *
 * `pathFilter` + `app.use(buildProxy(...))` (app KÖKÜNDE, path olmadan)
 * BİLEREK tercih edildi: `app.use('/api/outages', proxy)` yazsaydık,
 * Express proxy'ye ulaşmadan ÖNCE `/api/outages` önekini `req.url`den
 * SİLER — `pathRewrite`in `^/api/outages` deseni artık hiç eşleşmeyen,
 * zaten kırpılmış bir path görür ve rewrite sessizce uygulanmaz (istek
 * `/outages` yerine `/` olarak downstream'e gider, 404 patlar). Proxy'yi
 * kökte mount edip eşleştirmeyi `pathFilter`e bırakmak, `pathRewrite`in her
 * zaman ORİJİNAL path üzerinde çalışmasını garanti eder.
 *
 * Header'lar `proxyReq.setHeader` ile ekleniyor — `req.headers`i doğrudan
 * mutasyona uğratmak yerine http-proxy-middleware'in `on.proxyReq` kancasını
 * kullanmak resmi önerilen yöntem: bu kod, istek node'un http modülüne
 * devredilmeden hemen önce çalışır, aradaki hiçbir katman tarafından
 * atlanamaz.
 */
export function buildProxy(pathFilter: string, target: string, pathRewrite: Record<string, string>): RequestHandler {
  const options: Options = {
    target,
    changeOrigin: true,
    pathFilter,
    pathRewrite,
    on: {
      proxyReq: (proxyReq, req) => {
        const authedReq = req as AuthedRequest;

        if (authedReq.correlationId) proxyReq.setHeader('x-correlation-id', authedReq.correlationId);

        // Public route'larda (login/refresh/logout) req.user yok — o istekler
        // kimliksiz geçer, downstream zaten bunları auth gerektirmeden işler.
        if (authedReq.user) {
          proxyReq.setHeader('x-user-id', authedReq.user.id);
          proxyReq.setHeader('x-user-email', authedReq.user.email);
          proxyReq.setHeader('x-user-roles', authedReq.user.roles.join(','));
          proxyReq.setHeader('x-user-permissions', authedReq.user.permissions.join(','));
        }
      },
    },
  };

  return createProxyMiddleware(options);
}
