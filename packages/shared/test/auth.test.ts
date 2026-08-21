import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  ALL_PERMISSIONS,
  assertInScope,
  isPathInScope,
  minimalScopes,
  PERMISSION_MODULES,
  PERMISSIONS,
  permissionModule,
  ROLE_PERMISSIONS,
  ROLES,
  requireAnyPermission,
  requirePermission,
  toScopeMap,
  userFromHeaders,
  type AuthedRequest,
} from '../src/auth.ts';
import { ForbiddenError, OutOfScopeError, UnauthenticatedError } from '../src/errors.ts';

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
      user: { id: 'u1', email: 'a@b.c', roles: ['ADMIN'], permissions: ['outage:write'], scopes: {} },
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
      user: { id: 'u1', email: 'a@b.c', roles: ['OUTAGE_OPERATOR'], permissions: ['outage:read'], scopes: {} },
    });

    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).statusCode).toBe(403);
  });

  it('izin adı benzeri başka bir izinle karışmaz', () => {
    // 'outage:read' sahibi 'outage:write' yapamamalı.
    const err = runMiddleware(requirePermission(PERMISSIONS.OUTAGE_WRITE), {
      user: { id: 'u1', email: 'a@b.c', roles: [], permissions: ['outage:read'], scopes: {} },
    });

    expect(err).toBeInstanceOf(ForbiddenError);
  });
});

describe('requireAnyPermission', () => {
  it('izinlerden biri yeterlidir', () => {
    const err = runMiddleware(
      requireAnyPermission(PERMISSIONS.OUTAGE_READ, PERMISSIONS.WORKORDER_READ),
      { user: { id: 'u1', email: 'a@b.c', roles: [], permissions: ['workorder:read'], scopes: {} } },
    );

    expect(err).toBeUndefined();
  });

  it('hiçbiri yoksa 403 verir', () => {
    const err = runMiddleware(
      requireAnyPermission(PERMISSIONS.OUTAGE_READ, PERMISSIONS.WORKORDER_READ),
      { user: { id: 'u1', email: 'a@b.c', roles: [], permissions: ['user:manage'], scopes: {} } },
    );

    expect(err).toBeInstanceOf(ForbiddenError);
  });
});

describe('PERMISSION_MODULES', () => {
  it('her izin tam olarak bir modüle aittir', () => {
    const flat = Object.values(PERMISSION_MODULES).flat();
    expect(flat).toEqual([...new Set(flat)]);
    expect([...ALL_PERMISSIONS].sort()).toEqual([...new Set(Object.values(PERMISSIONS))].sort());
  });

  it('abone izinleri ayrı bir modül değil, Şebeke Yönetimi içindedir', () => {
    expect(permissionModule(PERMISSIONS.CUSTOMER_READ)).toBe('network');
    expect(permissionModule(PERMISSIONS.CUSTOMER_READ_PII)).toBe('network');
  });

  it('yüksek etkili kesinti izni hiçbir modülde yok', () => {
    expect(ALL_PERMISSIONS).not.toContain('outage:write-high-impact');
    expect(PERMISSION_MODULES.outage).toEqual(['outage:read', 'outage:write']);
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('rol ve izin tanımları beklenen matrisle eşleşir', () => {
    expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toEqual(ALL_PERMISSIONS);
    expect(ROLE_PERMISSIONS[ROLES.OUTAGE_OPERATOR]).toEqual(['outage:read', 'outage:write']);
    expect(ROLE_PERMISSIONS[ROLES.WORK_ORDER_OPERATOR]).toEqual(['workorder:read', 'workorder:write']);
  });

  it('saha rollerini ayıran şey etkinin büyüklüğü değil, kapsamdır', () => {
    // Üçü de aynı `outage:write` iznini taşır; farkı atamadaki `unit_path` yaratır.
    for (const role of [ROLES.FIELD_OPERATOR, ROLES.DISPATCHER] as const) {
      expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.OUTAGE_WRITE);
    }
    expect(ROLE_PERMISSIONS[ROLES.NETWORK_VIEWER]).not.toContain(PERMISSIONS.OUTAGE_WRITE);
    expect(ROLE_PERMISSIONS[ROLES.FIELD_OPERATOR]).not.toContain(PERMISSIONS.CUSTOMER_READ_PII);
    expect(ROLE_PERMISSIONS[ROLES.DISPATCHER]).toContain(PERMISSIONS.CUSTOMER_READ_PII);
  });

  it('operatör rolleri karşı alanın iznine sahip değil', () => {
    // Operatörlerin yalnızca yetkili oldukları alanların izinlerine sahip olduğunu doğrular.
    expect(ROLE_PERMISSIONS[ROLES.OUTAGE_OPERATOR]).not.toContain(PERMISSIONS.WORKORDER_WRITE);
    expect(ROLE_PERMISSIONS[ROLES.WORK_ORDER_OPERATOR]).not.toContain(PERMISSIONS.OUTAGE_WRITE);
    expect(ROLE_PERMISSIONS[ROLES.OUTAGE_OPERATOR]).not.toContain(PERMISSIONS.USER_MANAGE);
  });

  it('yalnızca ADMIN kullanıcı ve kapsam yönetebilir', () => {
    const canManage = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(PERMISSIONS.USER_MANAGE))
      .map(([role]) => role);

    expect(canManage).toEqual([ROLES.ADMIN]);

    const canScope = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(PERMISSIONS.SCOPE_MANAGE))
      .map(([role]) => role);

    expect(canScope).toEqual([ROLES.ADMIN]);
  });

  it('tanımlı her izin en az bir role bağlı — sahipsiz izin kalmasın', () => {
    const assigned = new Set(Object.values(ROLE_PERMISSIONS).flat());
    expect([...assigned].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe('kapsam yardımcıları', () => {
  const userWith = (scopes: Record<string, string[]>) => ({
    id: 'u1',
    email: 'a@b.c',
    roles: [],
    permissions: Object.keys(scopes),
    scopes,
  });

  it('alt ağaç kapsama girer, kardeş girmez', () => {
    expect(isPathInScope('TR.06.020.0137', ['TR.06.020'])).toBe(true);
    expect(isPathInScope('TR.06.020', ['TR.06.020'])).toBe(true);
    expect(isPathInScope('TR.06.012.0137', ['TR.06.020'])).toBe(false);
  });

  it('ön ek benzerliği kapsam sayılmaz', () => {
    // `TR.06.0201` `TR.06.020`'nin altı DEĞİLDİR; düz `startsWith` bunu kaçırırdı.
    expect(isPathInScope('TR.06.0201', ['TR.06.020'])).toBe(false);
  });

  it('atası listede olan yol elenir', () => {
    expect(minimalScopes(['TR.06.020', 'TR.06', 'TR.06.012', 'TR.06'])).toEqual(['TR.06']);
    expect(minimalScopes(['TR.06.020', 'TR.06.012'])).toEqual(['TR.06.012', 'TR.06.020']);
  });

  it('rol atamaları izin bazlı kapsam haritasına açılır', () => {
    const scopes = toScopeMap([
      { permissions: ['outage:read', 'outage:write'], unitPath: 'TR.06.020' },
      { permissions: ['outage:read'], unitPath: 'TR.06.012' },
    ]);

    expect(scopes['outage:read']).toEqual(['TR.06.012', 'TR.06.020']);
    expect(scopes['outage:write']).toEqual(['TR.06.020']);
  });

  it('kapsam dışı birim yazma yolunda reddedilir', () => {
    const user = userWith({ 'outage:write': ['TR.06.020'] });

    expect(() => assertInScope(user, PERMISSIONS.OUTAGE_WRITE, 'TR.06.020.0137', '100196')).not.toThrow();
    expect(() => assertInScope(user, PERMISSIONS.OUTAGE_WRITE, 'TR.06.012.0137', '100196')).toThrow(OutOfScopeError);
  });

  it('izni olmayan kullanıcının kapsamı boştur', () => {
    expect(() => assertInScope(userWith({}), PERMISSIONS.OUTAGE_WRITE, 'TR.06', '100196')).toThrow(OutOfScopeError);
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
        'x-user-scopes': '{"outage:read":["TR.06"]}',
      }),
    );

    expect(user).toEqual({
      id: 'u1',
      email: 'admin@inavitas.com',
      roles: ['ADMIN'],
      permissions: ['outage:read', 'user:manage'],
      scopes: { 'outage:read': ['TR.06'] },
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

  it('bozuk kapsam header\'ı "sınırsız" değil, "hiçbir bölge" demektir', () => {
    const user = userFromHeaders(
      req({ 'x-user-id': 'u1', 'x-user-email': 'a@b.c', 'x-user-scopes': '{bozuk' }),
    );

    expect(user?.scopes).toEqual({});
  });
});
