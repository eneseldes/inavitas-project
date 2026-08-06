import { asyncHandler, PERMISSIONS, requirePermission, type AuthedRequest } from '@edas/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.ts';
import { users } from '../db/schema.ts';
import * as authController from './controllers/auth.controller.ts';
import { authenticate } from './authenticate.ts';

export function buildRouter(): Router {
  const router = Router();

  // --- Sağlık kontrolleri ---
  // liveness: süreç ayakta mı. Bağımlılıkları KONTROL ETMEZ — Postgres
  // düştüğünde container'ın yeniden başlatılması sorunu çözmez, sadece
  // yeniden başlatma döngüsüne sokar.
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'access-service' });
  });

  // readiness: trafik alabilir miyim. Burada DB'ye gerçekten dokunuyoruz.
  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ready' });
    }),
  );

  // --- Kimlik doğrulama ---
  // login/refresh/logout herkese açık: token almanın yolu bunlar.
  router.post('/auth/login', asyncHandler<AuthedRequest>(authController.login));
  router.post('/auth/refresh', asyncHandler<AuthedRequest>(authController.refresh));
  router.post('/auth/logout', asyncHandler<AuthedRequest>(authController.logout));

  router.get('/auth/me', authenticate(), asyncHandler<AuthedRequest>(authController.me));

  // --- Kullanıcı yönetimi ---
  // Faz 1'de yalnızca izin zincirinin uçtan uca çalıştığını gösteren bir uç.
  // Tam CRUD (SRS: GET/POST /api/users) Faz 3'te gateway ile birlikte gelecek.
  router.get(
    '/users',
    authenticate(),
    requirePermission(PERMISSIONS.USER_MANAGE),
    asyncHandler(async (_req, res) => {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.createdAt);

      res.json({ items: rows, total: rows.length });
    }),
  );

  return router;
}
