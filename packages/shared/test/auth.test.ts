import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  ALL_PERMISSIONS,
  assertHighImpactAllowed,
  HIGH_IMPACT_TOPOLOGY_LEVEL,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  requireAnyPermission,
  requirePermission,
  userFromHeaders,
  type AuthedRequest,
} from '../src/auth.ts';
import { ForbiddenError, HighImpactForbiddenError, UnauthenticatedError } from '../src/errors.ts';

function runMiddleware(
  middleware: ReturnType<typeof requirePermission>,
  req: Partial<AuthedRequest>,
): unknown {
  const next = vi.fn() as unknown as NextFunction;
  middleware(req as AuthedRequest, {} as Response, next);
  return (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
}

describe('requirePermission', () => {
  it('izin varsa hatasız geçirir', () => {
    const err = runMiddleware(requirePermission(PERMISSIONS.OUTAGE_WRITE), {
      user: { id: 'u1', email: 'a@b.c', roles: ['ADMIN'], permissions: ['outage:write'] },
    });

    expect(err).toBeUndefined();
  });

  it('kimlik yoksa 401 verir, 403 değil', () => {
    // Ayrım önemli: istemci 401'de login'e yönlendirir, 403'te hata gösterir.
    const err = runMiddleware(requirePermission(PERMISSIONS.OUTAGE_WRITE), {});

    expect(err).toBeInstanceOf(UnauthenticatedError);
    expect((err as UnauthenticatedError).statusCode).toBe(401);
  });

  it('kimlik var ama izin yoksa 403 verir', () => {
    const err = runMiddleware(requirePermission(PERMISSIONS.USER_MANAGE), {
      user: { id: 'u1', email: 'a@b.c', roles: ['OUTAGE_OPERATOR'], permissions: ['outage:read'] },
    });

    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).statusCode).toBe(403);
  });

  it('izin adı benzeri başka bir izinle karışmaz', () => {
    // 'outage:read' sahibi 'outage:write' yapamamalı.
    const err = runMiddleware(requirePermission(PERMISSIONS.OUTAGE_WRITE), {
      user: { id: 'u1', email: 'a@b.c', roles: [], permissions: ['outage:read'] },
    });

    expect(err).toBeInstanceOf(ForbiddenError);
  });
});

describe('requireAnyPermission', () => {
  it('izinlerden biri yeterlidir', () => {
    const err = runMiddleware(
      requireAnyPermission(PERMISSIONS.OUTAGE_READ, PERMISSIONS.WORKORDER_READ),
      { user: { id: 'u1', email: 'a@b.c', roles: [], permissions: ['workorder:read'] } },
    );

    expect(err).toBeUndefined();
  });

  it('hiçbiri yoksa 403 verir', () => {
    const err = runMiddleware(
      requireAnyPermission(PERMISSIONS.OUTAGE_READ, PERMISSIONS.WORKORDER_READ),
      { user: { id: 'u1', email: 'a@b.c', roles: [], permissions: ['user:manage'] } },
    );

    expect(err).toBeInstanceOf(ForbiddenError);
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('rol ve izin tanımları beklenen matrisle eşleşir', () => {
    expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toEqual([
      'outage:read',
      'outage:write',
      'outage:write-high-impact',
      'workorder:read',
      'workorder:write',
      'user:manage',
      'translation:read',
      'translation:write',
      'translation:publish',
      'network:read',
      'customer:read',
      'customer:read-pii',
    ]);
    expect(ROLE_PERMISSIONS[ROLES.OUTAGE_OPERATOR]).toEqual(['outage:read', 'outage:write']);
    expect(ROLE_PERMISSIONS[ROLES.WORK_ORDER_OPERATOR]).toEqual(['workorder:read', 'workorder:write']);
  });

  it('operatör rolleri karşı alanın iznine sahip değil', () => {
    // Operatörlerin yalnızca yetkili oldukları alanların izinlerine sahip olduğunu doğrular.
    expect(ROLE_PERMISSIONS[ROLES.OUTAGE_OPERATOR]).not.toContain(PERMISSIONS.WORKORDER_WRITE);
    expect(ROLE_PERMISSIONS[ROLES.WORK_ORDER_OPERATOR]).not.toContain(PERMISSIONS.OUTAGE_WRITE);
    expect(ROLE_PERMISSIONS[ROLES.OUTAGE_OPERATOR]).not.toContain(PERMISSIONS.USER_MANAGE);
  });

  it('yüksek etkili kesinti izni operatörde yok — ek izindir', () => {
    // `outage:write` bir trafo kesicisini açmaya yeter; fider kesicisi ve üstü için
    // ayrıca `outage:write-high-impact` gerekir (bkz. assertHighImpactAllowed).
    expect(ROLE_PERMISSIONS[ROLES.OUTAGE_OPERATOR]).not.toContain(PERMISSIONS.OUTAGE_WRITE_HIGH_IMPACT);
    expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toContain(PERMISSIONS.OUTAGE_WRITE_HIGH_IMPACT);
  });

  it('yalnızca ADMIN kullanıcı yönetebilir', () => {
    const canManage = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(PERMISSIONS.USER_MANAGE))
      .map(([role]) => role);

    expect(canManage).toEqual([ROLES.ADMIN]);
  });

  it('tanımlı her izin en az bir role bağlı — sahipsiz izin kalmasın', () => {
    const assigned = new Set(Object.values(ROLE_PERMISSIONS).flat());
    expect([...assigned].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe('assertHighImpactAllowed', () => {
  const userWith = (...permissions: string[]) => ({ id: 'u1', email: 'a@b.c', roles: [], permissions });

  it('eşiğin altındaki eleman ek izin istemez', () => {
    // Trafo kesicisi seviye 8'dedir — `outage:write` tek başına yeter.
    expect(() => assertHighImpactAllowed(userWith(PERMISSIONS.OUTAGE_WRITE), '104000', 8)).not.toThrow();
  });

  it('eşikteki eleman ek izin olmadan reddedilir', () => {
    // Fider kesicisi seviye 2'dedir — tek açmayla 707 abone kararır.
    expect(() => assertHighImpactAllowed(userWith(PERMISSIONS.OUTAGE_WRITE), '100196', 2)).toThrow(
      HighImpactForbiddenError,
    );
  });

  it('sınır değeri dahildir — eşiğin kendisi de yüksek etkilidir', () => {
    expect(() =>
      assertHighImpactAllowed(userWith(PERMISSIONS.OUTAGE_WRITE), '100196', HIGH_IMPACT_TOPOLOGY_LEVEL),
    ).toThrow(HighImpactForbiddenError);
  });

  it('ek izinle eşikteki eleman geçer', () => {
    const user = userWith(PERMISSIONS.OUTAGE_WRITE, PERMISSIONS.OUTAGE_WRITE_HIGH_IMPACT);
    expect(() => assertHighImpactAllowed(user, '100000', 0)).not.toThrow();
  });
});

describe('userFromHeaders', () => {
  const req = (headers: Record<string, string>): Request =>
    ({ header: (name: string) => headers[name.toLowerCase()] }) as Request;

  it('gateway header\'larından kimliği kurar', () => {
    const user = userFromHeaders(
      req({
        'x-user-id': 'u1',
        'x-user-email': 'admin@inavitas.com',
        'x-user-roles': 'ADMIN',
        'x-user-permissions': 'outage:read, user:manage',
      }),
    );

    expect(user).toEqual({
      id: 'u1',
      email: 'admin@inavitas.com',
      roles: ['ADMIN'],
      permissions: ['outage:read', 'user:manage'],
    });
  });

  it('zorunlu header yoksa undefined döner', () => {
    expect(userFromHeaders(req({ 'x-user-id': 'u1' }))).toBeUndefined();
  });

  it('boş izin listesini boş diziye çevirir', () => {
    const user = userFromHeaders(
      req({ 'x-user-id': 'u1', 'x-user-email': 'a@b.c', 'x-user-permissions': '' }),
    );

    expect(user?.permissions).toEqual([]);
  });
});
