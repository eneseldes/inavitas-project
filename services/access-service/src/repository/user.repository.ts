import { and, count, eq, exists, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '../db.ts';
import { permissions, rolePermissions, roles, userRoles, users } from '../db/schema.ts';
import type { LockState } from '../domain/lockout.ts';
import type { PageResult } from '@inavitas/shared';

/** Roller ve izinler eklenmiş kullanıcı veri yapısı. */
export interface UserWithAccess {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  roles: string[];
  permissions: string[];
}

/** Liste yanıtında dönen basit kullanıcı satırı. */
export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
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

/** Veritabanı ilişki satırlarını düz roller ve benzersiz izin dizilerine dönüştürür. */
function toUserWithAccess(row: UserRow): UserWithAccess {
  const roleCodes = row.userRoles.map((ur) => ur.role.code);
  const perms = new Set<string>();

  for (const userRole of row.userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      perms.add(rp.permission.code);
    }
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    isActive: row.isActive,
    failedAttempts: row.failedAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    roles: roleCodes,
    permissions: [...perms],
  };
}

/** E-posta adresiyle kullanıcı arar. */
export async function findByEmail(email: string): Promise<UserWithAccess | null> {
  const row = await db.query.users.findFirst({ where: eq(users.email, email), with: withAccess });
  return row ? toUserWithAccess(row) : null;
}

/** Benzersiz ID ile kullanıcı arar. */
export async function findById(id: string): Promise<UserWithAccess | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, id), with: withAccess });
  return row ? toUserWithAccess(row) : null;
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

  const items: UserListItem[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    isActive: r.isActive,
    roles: r.userRoles.map((ur) => ur.role.code),
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

/** Yeni kullanıcı oluşturur ve rollerini atar (transaction). */
export async function create(
  input: { email: string; fullName: string },
  passwordHash: string,
  roleIds: string[],
): Promise<string> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, fullName: input.fullName, passwordHash })
      .returning({ id: users.id });

    if (roleIds.length > 0) {
      await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId: user!.id, roleId })));
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

/** Kullanıcının rol setini değiştirir (tamamını değiştirir). */
export async function setRoles(userId: string, roleIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (roleIds.length > 0) {
      await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
    }
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
