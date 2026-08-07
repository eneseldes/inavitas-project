import type { AuthedRequest } from '@inavitas/shared';
import type { RequestHandler } from 'express';
import { createProxyMiddleware, type Options } from 'http-proxy-middleware';

/**
 * Hedef mikroservise proxy yönlendirmesi oluşturur.
 * Doğrulanmış kullanıcı bilgilerini ve correlationId değerini HTTP header'larına ekler.
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
