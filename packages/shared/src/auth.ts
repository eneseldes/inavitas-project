import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, OutOfScopeError, UnauthenticatedError } from './errors.ts';

/** Kullanıcı rol tanımları. */
export const ROLES = {
  ADMIN: 'ADMIN',
  OUTAGE_OPERATOR: 'OUTAGE_OPERATOR',
  WORK_ORDER_OPERATOR: 'WORK_ORDER_OPERATOR',
  NETWORK_VIEWER: 'NETWORK_VIEWER',
  FIELD_OPERATOR: 'FIELD_OPERATOR',
  DISPATCHER: 'DISPATCHER',
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
  SCOPE_MANAGE: 'scope:manage',
  TRANSLATION_READ: 'translation:read',
  TRANSLATION_WRITE: 'translation:write',
  TRANSLATION_PUBLISH: 'translation:publish',
  NETWORK_READ: 'network:read',
  NETWORK_TRACE: 'network:trace',
  NETWORK_SWITCH: 'network:switch',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_READ_PII: 'customer:read-pii',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * İzin → modül eşlemesi. Rol panelindeki kutular buradan gelir; izin kodunun önekinden
 * TÜRETİLMEZ. Abone izinleri şebekenin bir parçasıdır, ayrı bir modül değildir.
 *
 * Dizinin sırası hem `permissions.sort_order` kolonunun hem de paneldeki satır sırasının
 * kaynağıdır. Yeni bir izin **yeni bir modül açmaz** — ait olduğu ekranın modülüne girer.
 */
export const PERMISSION_MODULES = {
  network: [
    PERMISSIONS.NETWORK_READ,
    PERMISSIONS.NETWORK_TRACE,
    PERMISSIONS.NETWORK_SWITCH,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_READ_PII,
  ],
  outage: [PERMISSIONS.OUTAGE_READ, PERMISSIONS.OUTAGE_WRITE],
  workorder: [PERMISSIONS.WORKORDER_READ, PERMISSIONS.WORKORDER_WRITE],
  access: [PERMISSIONS.USER_MANAGE, PERMISSIONS.SCOPE_MANAGE],
  translation: [
    PERMISSIONS.TRANSLATION_READ,
    PERMISSIONS.TRANSLATION_WRITE,
    PERMISSIONS.TRANSLATION_PUBLISH,
  ],
} as const satisfies Record<string, readonly Permission[]>;

export type PermissionModule = keyof typeof PERMISSION_MODULES;

/**
 * Tüm izinler — modül listesinden TÜRETİLİR. Böylece modülsüz bir izin tanımlanamaz ve
 * seed hiçbir izni atlamaz (eskiden liste `ROLE_PERMISSIONS`'tan türetildiği için hiçbir
 * role atanmamış izin veritabanına hiç girmiyordu).
 */
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSION_MODULES).flat();

/** Bir iznin ait olduğu modülü döner. */
export function permissionModule(code: Permission): PermissionModule {
  for (const [module, codes] of Object.entries(PERMISSION_MODULES) as [PermissionModule, readonly Permission[]][]) {
    if (codes.includes(code)) return module;
  }
  throw new Error(`İzin hiçbir modüle ait değil: ${code}`);
}

/** Rol → izin eşleme haritası. Veritabanı seed işlemlerinde ve yetkilendirmede kullanılır. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  OUTAGE_OPERATOR: [PERMISSIONS.OUTAGE_READ, PERMISSIONS.OUTAGE_WRITE],
  WORK_ORDER_OPERATOR: [PERMISSIONS.WORKORDER_READ, PERMISSIONS.WORKORDER_WRITE],
  NETWORK_VIEWER: [
    PERMISSIONS.NETWORK_READ,
    PERMISSIONS.NETWORK_TRACE,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.OUTAGE_READ,
    PERMISSIONS.WORKORDER_READ,
  ],
  // Kesinti açma üç saha rolünde de TEK izindir (`outage:write`); rolleri ayıran şey
  // etkinin büyüklüğü değil, atamadaki kapsamın genişliğidir.
  FIELD_OPERATOR: [
    PERMISSIONS.NETWORK_READ,
    PERMISSIONS.NETWORK_TRACE,
    PERMISSIONS.NETWORK_SWITCH,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.OUTAGE_READ,
    PERMISSIONS.OUTAGE_WRITE,
    PERMISSIONS.WORKORDER_READ,
    PERMISSIONS.WORKORDER_WRITE,
  ],
  DISPATCHER: [
    PERMISSIONS.NETWORK_READ,
    PERMISSIONS.NETWORK_TRACE,
    PERMISSIONS.NETWORK_SWITCH,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_READ_PII,
    PERMISSIONS.OUTAGE_READ,
    PERMISSIONS.OUTAGE_WRITE,
    PERMISSIONS.WORKORDER_READ,
    PERMISSIONS.WORKORDER_WRITE,
  ],
};

/**
 * Kök kapsam — veri seti bugün yalnız Ankara'yı taşıdığı için il düğümü aynı zamanda
 * ağacın köküdür. Kapsamsız bir atamanın varsayılanı ve `user_roles` göçünün doldurduğu
 * değer budur: kolon eklenirken kimse yetkisini kaybetmemeli.
 */
export const ROOT_UNIT_PATH = 'TR.06';

/**
 * İzin → o iznin geçerli olduğu birim yolları (ltree). Kapsam **role** bağlıdır; etkin
 * (izin, bölge) kümesi rolün izinleri açılarak türetilir — her izin o rol atamasının
 * `unit_path`'ini miras alır.
 */
export type ScopeMap = Record<string, string[]>;

/** Bir kullanıcıya verilmiş tek bir rol ataması. */
export interface RoleAssignment {
  roleCode: string;
  unitPath: string;
}

/** `x-user-scopes` header'ı ve JWT claim'i için kapsam kümesinin taşındığı biçim. */
export const SCOPES_HEADER_NAME = 'x-user-scopes';

/** `a.b` yolu `a` kapsamının altında mı — ltree `<@` operatörünün bellek-içi karşılığı. */
export function isPathInScope(path: string, scopes: readonly string[]): boolean {
  return scopes.some((scope) => path === scope || path.startsWith(`${scope}.`));
}

/**
 * Bir yol kümesinden atası zaten listede olanları eler. `TR.06` ile `TR.06.012` birlikte
 * tutulursa sorguya iki koşul birden girer ve ikincisi hiçbir şey eklemez; kapsam listesi
 * JWT'de ve header'da taşındığı için gereksiz her satırın bir bedeli var.
 */
export function minimalScopes(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)].sort();
  return unique.filter((path, index) => !isPathInScope(path, unique.slice(0, index)));
}

/** Rol atamalarını (izin → bölgeler) haritasına açar. */
export function toScopeMap(grants: readonly { permissions: readonly string[]; unitPath: string }[]): ScopeMap {
  const collected = new Map<string, string[]>();

  for (const grant of grants) {
    for (const permission of grant.permissions) {
      const paths = collected.get(permission);
      if (paths) paths.push(grant.unitPath);
      else collected.set(permission, [grant.unitPath]);
    }
  }

  const scopes: ScopeMap = {};
  for (const [permission, paths] of collected) scopes[permission] = minimalScopes(paths);
  return scopes;
}

/**
 * Bir idari birimin kullanıcıya görünür olup olmadığı: kapsamın **altı** ya da **üstü**.
 *
 * Ata birimler bilerek görünür — Yenimahalle sorumlusu Ankara'yı görmezse ağaç köksüz kalır
 * ve haritada il sınırı hiç çizilmez. SQL karşılığı `scopeFilterUnitTree`'dir.
 */
export function isUnitVisible(user: AuthenticatedUser, permission: Permission, path: string): boolean {
  const scopes = scopesFor(user, permission);
  return isPathInScope(path, scopes) || scopes.some((scope) => isPathInScope(scope, [path]));
}

/** Kullanıcının bir izni hangi bölgelerde taşıdığını döner; izin yoksa boş dizi. */
export function scopesFor(user: AuthenticatedUser, permission: Permission): string[] {
  return user.scopes[permission] ?? [];
}

/**
 * Hedef birimin kullanıcının kapsamında olduğunu doğrular.
 *
 * ⚠️ Yazma yolları bunu **kayıt anında** çağırmalı: istemcinin gösterdiği listenin
 * süzülmüş olması bir yetki kanıtı değildir, istek listeden geçmeden de atılabilir.
 */
export function assertInScope(
  user: AuthenticatedUser,
  permission: Permission,
  unitPath: string,
  resourceId: string,
): void {
  if (isPathInScope(unitPath, scopesFor(user, permission))) return;
  throw new OutOfScopeError(resourceId, unitPath);
}

/** İstek boyunca taşınan kimlik ve yetki bilgileri. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  /** İzin başına bölgesel kapsam. `permissions` bu haritanın anahtar kümesidir. */
  scopes: ScopeMap;
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

/** Kapsam haritasını header/claim biçiminden geri okur; bozuk değer boş haritaya düşer. */
export function parseScopeMap(raw: string | undefined): ScopeMap {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const scopes: ScopeMap = {};
    for (const [permission, paths] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(paths)) scopes[permission] = paths.filter((p): p is string => typeof p === 'string');
    }
    return scopes;
  } catch {
    // Bozuk bir kapsam kümesi "sınırsız" anlamına GELMEZ — boş haritaya düşülür, yani
    // hiçbir bölgede yetki yok.
    return {};
  }
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
    scopes: parseScopeMap(req.header(SCOPES_HEADER_NAME)),
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
