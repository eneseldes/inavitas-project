/**
 * Rol / izin sözleşmesi ve yetki kontrolü.
 *
 * Üç servis de bu dosyayı kullanır. access-service izinleri JWT'ye yazar,
 * diğer servisler gateway'in eklediği header'lardan okuyup burada doğrular.
 */

import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthenticatedError } from './errors.ts';

/** Rol kodları — SRS 1.3. */
export const ROLES = {
  ADMIN: 'ADMIN',
  OUTAGE_OPERATOR: 'OUTAGE_OPERATOR',
  WORK_ORDER_OPERATOR: 'WORK_ORDER_OPERATOR',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * İzin kodları. Yetki kontrolü HER ZAMAN izin üzerinden yapılır, rol
 * üzerinden değil — yarın yeni bir rol eklendiğinde kod değişmesin diye.
 */
export const PERMISSIONS = {
  OUTAGE_READ: 'outage:read',
  OUTAGE_WRITE: 'outage:write',
  WORKORDER_READ: 'workorder:read',
  WORKORDER_WRITE: 'workorder:write',
  USER_MANAGE: 'user:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Rol → izin eşlemesi. Seed bu tablodan üretilir. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: [
    PERMISSIONS.OUTAGE_READ,
    PERMISSIONS.OUTAGE_WRITE,
    PERMISSIONS.WORKORDER_READ,
    PERMISSIONS.WORKORDER_WRITE,
    PERMISSIONS.USER_MANAGE,
  ],
  OUTAGE_OPERATOR: [PERMISSIONS.OUTAGE_READ, PERMISSIONS.OUTAGE_WRITE],
  WORK_ORDER_OPERATOR: [PERMISSIONS.WORKORDER_READ, PERMISSIONS.WORKORDER_WRITE],
};

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

/** İstek boyunca taşınan kimlik. JWT payload'ı ile aynı şekle sahiptir. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/**
 * Express `Request`ine `user` ve `correlationId` ekliyoruz.
 *
 * Global `declare` yerine kendi tipimizi tanımlıyoruz: global genişletme
 * tüm projeye sızar ve "bu alan gerçekten dolu mu" sorusunu tip sisteminden
 * gizler. Burada açıkça `?` ile opsiyonel — middleware çalışmadıysa yok.
 */
export interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
  correlationId?: string;
}

/**
 * Belirli bir izni zorunlu kılan middleware.
 *
 * @example
 * router.post('/outages', requirePermission(PERMISSIONS.OUTAGE_WRITE), createOutage);
 */
export function requirePermission(permission: Permission) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const user = req.user;

    // 401 ile 403'ü ayır: "kim olduğunu bilmiyorum" ile "kim olduğunu
    // biliyorum ama yetkin yok" farklı sorunlar, istemci farklı davranmalı
    // (birinde login'e yönlendir, diğerinde hata göster).
    if (!user) {
      next(new UnauthenticatedError());
      return;
    }

    if (!user.permissions.includes(permission)) {
      next(new ForbiddenError(`Bu işlem için '${permission}' izni gerekiyor`));
      return;
    }

    next();
  };
}

/** Verilen izinlerden en az birine sahip olmayı yeterli sayar. */
export function requireAnyPermission(...permissions: Permission[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      next(new UnauthenticatedError());
      return;
    }

    if (!permissions.some((p) => user.permissions.includes(p))) {
      next(new ForbiddenError(`Bu işlem için şu izinlerden biri gerekiyor: ${permissions.join(', ')}`));
      return;
    }

    next();
  };
}

/**
 * Gateway'in eklediği `X-User-*` header'larından kimliği okur.
 *
 * Bunu YALNIZCA downstream servisler (outage, work-order) kullanır — gateway
 * dış dünyadan gelen bu header'ları sildiği için içeride onlara güvenilebilir.
 * Gateway'in kendisi JWT'yi doğrudan doğrular, bu fonksiyonu kullanmaz.
 */
export function userFromHeaders(req: Request): AuthenticatedUser | undefined {
  const id = req.header('x-user-id');
  const email = req.header('x-user-email');

  if (!id || !email) return undefined;

  const split = (value: string | undefined): string[] =>
    value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];

  return {
    id,
    email,
    roles: split(req.header('x-user-roles')),
    permissions: split(req.header('x-user-permissions')),
  };
}

/**
 * `X-User-*` header'larından kimliği kurup `req.user`a yazan middleware.
 *
 * outage-service ve work-order-service bunu kullanır: access-service'in
 * aksine kendi JWT'lerini doğrulamazlar, gateway'in doğruladığı kimliğe
 * (ve doğruladıktan sonra eklediği header'lara) güvenirler.
 *
 * ⚠️ Faz 3'te gateway devreye girene kadar bu header'ları dışarıdan gelen
 * spoofed header'lardan ayıran hiçbir şey yok — o yüzden bu dönemde
 * servisleri doğrudan (gateway'siz) test ederken header'ları elle sen
 * ekliyorsun (bkz. docs/04-KURULUM.md test notları). Üretimde bu header'lar
 * yalnızca gateway'in eklediği, dışarıdan gelenler silindiği için güvenlidir.
 */
export function authenticateFromHeaders() {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const user = userFromHeaders(req);

    if (!user) {
      next(new UnauthenticatedError());
      return;
    }

    req.user = user;
    next();
  };
}
