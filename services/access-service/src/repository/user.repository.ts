import { and, count, eq, exists, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '../db.ts';
import { permissions, rolePermissions, roles, userRoles, users } from '../db/schema.ts';
import * as unitRepository from './unit.repository.ts';
import type { LockState } from '../domain/lockout.ts';
import { toScopeMap, type PageResult, type ScopeMap } from '@inavitas/shared';

/** Rol ataması — rol ve kapsamı birlikte taşır; arayüz "Saha Operatörü @ Keçiören" der. */
export interface AssignmentRow {
  roleCode: string;
  roleName: string;
  isSystem: boolean;
  unitPath: string;
  unitName: string | null;
}

/** Roller, izinler ve kapsam eklenmiş kullanıcı veri yapısı. */
export interface UserWithAccess {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  scopeVersion: number;
  roles: string[];
  permissions: string[];
  /** İzin → bölgeler. Rol atamalarının izinleri açılarak türetilir. */
  scopes: ScopeMap;
  assignments: AssignmentRow[];
}

/** Liste yanıtında dönen basit kullanıcı satırı. */
export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  /** "Saha Operatörü @ Keçiören" satırı için rol kodu ve birim adı birlikte döner. */
  assignments: { roleCode: string; unitPath: string; unitName: string | null }[];
  lastLoginAt: Date | null;
}

export interface ListFilters {
  q?: string;
  email?: string;
  roles?: string[];
  lastLoginAtFrom?: Date;
  lastLoginAtTo?: Date;
  isActive?: boolean;
}

export interface ListPagination {
  page: number;
  pageSize: number;
}

export interface ListSort {
  field: string;
  dir: 'asc' | 'desc';
}

const withAccess = {
  userRoles: { with: { role: { with: { rolePermissions: { with: { permission: true } } } } } },
} as const;

type UserRow = NonNullable<
  Awaited<ReturnType<typeof db.query.users.findFirst<{ with: typeof withAccess }>>>
>;

/**
 * Veritabanı ilişki satırlarını roller, izinler ve **izin bazlı kapsam haritasına** çevirir.
 *
 * Etkin (izin, bölge) kümesi burada türetilir: her rol ataması kendi izinlerine açılır ve
 * her izin o satırın `unit_path`'ini miras alır. Aynı rol farklı bölgelerde birden çok kez
 * verilmiş olabilir; kapsamlar izin başına birleştirilir.
 */
function toUserWithAccess(row: UserRow, names: Map<string, string>): UserWithAccess {
  const scopes = toScopeMap(
    row.userRoles.map((ur) => ({
      permissions: ur.role.rolePermissions.map((rp) => rp.permission.code),
      unitPath: ur.unitPath,
    })),
  );

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    isActive: row.isActive,
    failedAttempts: row.failedAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    scopeVersion: row.scopeVersion,
    roles: [...new Set(row.userRoles.map((ur) => ur.role.code))],
    // İzin listesi kapsam haritasının anahtar kümesidir; ikisi ayrı türetilirse biri
    // diğerinden sapabilir ve izni olan ama kapsamı olmayan bir kullanıcı doğar.
    permissions: Object.keys(scopes),
    scopes,
    assignments: row.userRoles.map((ur) => ({
      roleCode: ur.role.code,
      roleName: ur.role.name,
      isSystem: ur.role.isSystem,
      unitPath: ur.unitPath,
      unitName: names.get(ur.unitPath) ?? null,
    })),
  };
}

/**
 * İlişki satırlarını okunabilir hâle getirir; atamaların birim adları `units_ro`'dan
 * ayrı bir sorguyla gelir (read-model'dir, drizzle ilişkisi/foreign key'i yoktur).
 */
async function hydrate(row: UserRow | undefined): Promise<UserWithAccess | null> {
  if (!row) return null;
  const names = await unitRepository.namesByPath(row.userRoles.map((ur) => ur.unitPath));
  return toUserWithAccess(row, names);
}

/** E-posta adresiyle kullanıcı arar. */
export async function findByEmail(email: string): Promise<UserWithAccess | null> {
  return hydrate(await db.query.users.findFirst({ where: eq(users.email, email), with: withAccess }));
}

/** Benzersiz ID ile kullanıcı arar. */
export async function findById(id: string): Promise<UserWithAccess | null> {
  return hydrate(await db.query.users.findFirst({ where: eq(users.id, id), with: withAccess }));
}

/** E-posta adresinin kullanımda olup olmadığını kontrol eder. */
export async function existsByEmail(email: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return row !== undefined;
}

/** Sistemdeki aktif ADMIN kullanıcı sayısını döner. */
export async function countAdmins(): Promise<number> {
  const adminRole = await db.query.roles.findFirst({ where: eq(roles.code, 'ADMIN') });
  if (!adminRole) return 0;

  const [row] = await db
    .select({ cnt: count() })
    .from(userRoles)
    .innerJoin(users, and(eq(userRoles.userId, users.id), eq(users.isActive, true)))
    .where(eq(userRoles.roleId, adminRole.id));

  return Number(row?.cnt ?? 0);
}

/** Sayfalı kullanıcı listesi — roller dahil. */
export async function list(
  filters: ListFilters,
  pagination: ListPagination,
  sort: ListSort,
): Promise<PageResult<UserListItem>> {
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  const where = and(
    filters.isActive !== undefined ? eq(users.isActive, filters.isActive) : undefined,
    filters.q
      ? or(ilike(users.fullName, `%${filters.q}%`), ilike(users.email, `%${filters.q}%`))
      : undefined,
    filters.email ? ilike(users.email, `%${filters.email}%`) : undefined,
    filters.lastLoginAtFrom ? gte(users.lastLoginAt, filters.lastLoginAtFrom) : undefined,
    filters.lastLoginAtTo ? lt(users.lastLoginAt, filters.lastLoginAtTo) : undefined,
    filters.roles && filters.roles.length > 0
      ? exists(
          db
            .select({ one: sql`1` })
            .from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .where(and(eq(userRoles.userId, users.id), inArray(roles.code, filters.roles))),
        )
      : undefined,
  );

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  const orderBy =
    sort.field === 'email'
      ? sort.dir === 'asc'
        ? [users.email]
        : [sql`${users.email} desc`]
      : sort.field === 'fullName'
        ? sort.dir === 'asc'
          ? [users.fullName]
          : [sql`${users.fullName} desc`]
        : // Hiç giriş yapmamış kullanıcılar (null) sıralama yönünden bağımsız
          // her zaman en sona düşer.
          sort.dir === 'asc'
          ? [sql`${users.lastLoginAt} asc nulls last`]
          : [sql`${users.lastLoginAt} desc nulls last`];

  const rows = await db.query.users.findMany({
    where,
    orderBy,
    limit: pageSize,
    offset,
    with: { userRoles: { with: { role: true } } },
  });

  // Birim adları sayfanın tamamı için TEK sorguda çözülür; satır başına arama yapılmaz.
  const names = await unitRepository.namesByPath(rows.flatMap((r) => r.userRoles.map((ur) => ur.unitPath)));

  const items: UserListItem[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    isActive: r.isActive,
    assignments: r.userRoles.map((ur) => ({
      roleCode: ur.role.code,
      unitPath: ur.unitPath,
      unitName: names.get(ur.unitPath) ?? null,
    })),
    lastLoginAt: r.lastLoginAt,
  }));

  return {
    items,
    page,
    pageSize,
    total: total ?? 0,
    totalPages: Math.max(1, Math.ceil((total ?? 0) / pageSize)),
  };
}

/** Kaydedilecek bir rol ataması — kapsam rolün yanında taşınır. */
export interface AssignmentInput {
  roleId: string;
  unitPath: string;
}

/** Yeni kullanıcı oluşturur ve rol atamalarını yazar (transaction). */
export async function create(
  input: { email: string; fullName: string },
  passwordHash: string,
  assignments: AssignmentInput[],
): Promise<string> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, fullName: input.fullName, passwordHash })
      .returning({ id: users.id });

    if (assignments.length > 0) {
      await tx.insert(userRoles).values(assignments.map((a) => ({ userId: user!.id, ...a })));
    }

    return user!.id;
  });
}

/** Kullanıcı e-posta, ad ve aktiflik durumunu günceller. */
export async function updateProfile(
  id: string,
  patch: { email?: string; fullName?: string; isActive?: boolean },
): Promise<void> {
  await db.update(users).set(patch).where(eq(users.id, id));
}

/**
 * Kullanıcının rol atamalarını tamamıyla değiştirir ve yeni kapsam sürümünü döner.
 *
 * Sürüm artışı atamalarla AYNI transaction'dadır: ayrı yazılsaydı arada geçen sürede eski
 * kapsam hâlâ geçerli olurdu. Sürümün gateway'e duyurulması çağıranın işidir (bkz.
 * `publishScopeVersion`) — gateway veritabanına bağlanmaz, bayat token'ı Redis'ten öğrenir.
 */
export async function setAssignments(userId: string, assignments: AssignmentInput[]): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (assignments.length > 0) {
      await tx.insert(userRoles).values(assignments.map((a) => ({ userId, ...a })));
    }

    const [row] = await tx
      .update(users)
      .set({ scopeVersion: sql`${users.scopeVersion} + 1` })
      .where(eq(users.id, userId))
      .returning({ scopeVersion: users.scopeVersion });

    return row!.scopeVersion;
  });
}

/** Kullanıcı parolasını günceller. */
export async function updatePassword(id: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
}

/** Kullanıcının kilit durumunu ve başarısız deneme sayısını günceller. */
export async function updateLockState(userId: string, state: LockState): Promise<void> {
  await db
    .update(users)
    .set({ failedAttempts: state.failedAttempts, lockedUntil: state.lockedUntil })
    .where(eq(users.id, userId));
}

/** Başarılı girişte son giriş zamanını şimdiki zamana günceller. */
export async function touchLastLogin(userId: string, at: Date): Promise<void> {
  await db.update(users).set({ lastLoginAt: at }).where(eq(users.id, userId));
}

/** Kullanıcının belirli role sahip olup olmadığını kontrol eder. */
export async function hasRole(userId: string, roleCode: string): Promise<boolean> {
  const role = await db.query.roles.findFirst({ where: eq(roles.code, roleCode) });
  if (!role) return false;

  const [row] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)))
    .limit(1);

  return row !== undefined;
}
