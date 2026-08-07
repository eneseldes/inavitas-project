import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthenticatedError } from './errors.ts';

/** Kullanıcı rol tanımları. */
export const ROLES = {
  ADMIN: 'ADMIN',
  OUTAGE_OPERATOR: 'OUTAGE_OPERATOR',
  WORK_ORDER_OPERATOR: 'WORK_ORDER_OPERATOR',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * İzin tanımları. Yetki kontrolleri doğrudan izinler (permissions) üzerinden yürütülür.
 */
export const PERMISSIONS = {
  OUTAGE_READ: 'outage:read',
  OUTAGE_WRITE: 'outage:write',
  WORKORDER_READ: 'workorder:read',
  WORKORDER_WRITE: 'workorder:write',
  USER_MANAGE: 'user:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Rol → izin eşleme haritası. Veritabanı seed işlemlerinde ve yetkilendirmede kullanılır. */
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

/** İstek boyunca taşınan kimlik ve yetki bilgileri. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/**
 * Express Request tipini kullanıcı ve izleme (correlationId) bilgileri ile genişletir.
 */
export interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
  correlationId?: string;
}

/**
 * İsteğin belirli bir izne sahip kullanıcı tarafından yapıldığını doğrulayan middleware.
 */
export function requirePermission(permission: Permission) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const user = req.user;

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

/**
 * İsteğin verilen izinlerden en az birine sahip kullanıcı tarafından yapıldığını doğrulayan middleware.
 */
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
 * Gateway tarafından iletilen `X-User-*` HTTP header'larından kullanıcı kimliğini ayrıştırır.
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
 * HTTP header'larındaki kullanıcı kimliğini okuyup `req.user` nesnesine aktaran middleware.
 * Alt servislerde (outage-service, work-order-service) yetkilendirme bağlamını kurmak için kullanılır.
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
