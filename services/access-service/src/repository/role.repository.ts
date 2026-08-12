import { count, eq, sql } from 'drizzle-orm';
import { db } from '../db.ts';
import { permissions, rolePermissions, roles, userRoles } from '../db/schema.ts';

export interface RoleListItem {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
}

export interface RoleDetail {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissionCodes: string[];
}

/** Tüm rolleri izin ve kullanıcı sayısıyla birlikte listeler. */
export async function list(): Promise<RoleListItem[]> {
  const rows = await db
    .select({
      id: roles.id,
      code: roles.code,
      name: roles.name,
      isSystem: roles.isSystem,
      permissionCount: sql<number>`count(distinct ${rolePermissions.permissionId})::int`,
      userCount: sql<number>`count(distinct ${userRoles.userId})::int`,
    })
    .from(roles)
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(userRoles, eq(userRoles.roleId, roles.id))
    .groupBy(roles.id);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isSystem: r.isSystem,
    permissionCount: r.permissionCount ?? 0,
    userCount: r.userCount ?? 0,
  }));
}

/** ID ile rol ve izin kodlarını getirir. */
export async function findById(id: string): Promise<RoleDetail | null> {
  const row = await db.query.roles.findFirst({
    where: eq(roles.id, id),
    with: { rolePermissions: { with: { permission: true } } },
  });

  if (!row) return null;

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isSystem: row.isSystem,
    permissionCodes: row.rolePermissions.map((rp) => rp.permission.code),
  };
}

/** Kod listesine göre rolleri getirir (doğrulama için). */
export async function findByCodes(codes: string[]): Promise<{ id: string; code: string }[]> {
  if (codes.length === 0) return [];
  const rows = await db
    .select({ id: roles.id, code: roles.code })
    .from(roles)
    .where(sql`${roles.code} = ANY(${sql.raw(`ARRAY[${codes.map(() => '?').join(',')}]`)})`)
  // Drizzle inArray kullanımı:
  ;

  // inArray yerine manuel filtreleme
  const all = await db.select({ id: roles.id, code: roles.code }).from(roles);
  return all.filter((r) => codes.includes(r.code));
}

/** Yeni rol oluşturur ve izinlerini atar (transaction). */
export async function create(input: {
  name: string;
  code: string;
  permissionCodes: string[];
}): Promise<string> {
  return db.transaction(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({ code: input.code, name: input.name, isSystem: false })
      .returning({ id: roles.id });

    if (input.permissionCodes.length > 0) {
      const perms = await tx
        .select({ id: permissions.id, code: permissions.code })
        .from(permissions);

      const permIds = input.permissionCodes
        .map((c) => perms.find((p) => p.code === c)?.id)
        .filter((id): id is string => id !== undefined);

      if (permIds.length > 0) {
        await tx.insert(rolePermissions).values(
          permIds.map((permissionId) => ({ roleId: role!.id, permissionId })),
        );
      }
    }

    return role!.id;
  });
}

/** Rol adını günceller (sadece isSystem=false). */
export async function updateName(id: string, name: string): Promise<void> {
  await db.update(roles).set({ name }).where(eq(roles.id, id));
}

/** Rolün izin setini tamamıyla değiştirir (transaction). */
export async function setPermissions(roleId: string, permissionCodes: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

    if (permissionCodes.length > 0) {
      const perms = await tx
        .select({ id: permissions.id, code: permissions.code })
        .from(permissions);

      const permIds = permissionCodes
        .map((c) => perms.find((p) => p.code === c)?.id)
        .filter((id): id is string => id !== undefined);

      if (permIds.length > 0) {
        await tx.insert(rolePermissions).values(
          permIds.map((permissionId) => ({ roleId, permissionId })),
        );
      }
    }
  });
}

/** Roldeki kullanıcı sayısını döner (silme guard'ı için). */
export async function countUsers(roleId: string): Promise<number> {
  const [row] = await db
    .select({ cnt: count() })
    .from(userRoles)
    .where(eq(userRoles.roleId, roleId));

  return Number(row?.cnt ?? 0);
}

/** Rolü siler. */
export async function remove(id: string): Promise<void> {
  await db.delete(roles).where(eq(roles.id, id));
}

/** Kod ile rol getirir. */
export async function findByCode(code: string): Promise<{ id: string; code: string; name: string; isSystem: boolean } | null> {
  const [row] = await db
    .select({ id: roles.id, code: roles.code, name: roles.name, isSystem: roles.isSystem })
    .from(roles)
    .where(eq(roles.code, code))
    .limit(1);

  return row ?? null;
}

/** Tüm roller — kod listesine göre doğrulama. */
export async function validateCodes(codes: string[]): Promise<string[]> {
  if (codes.length === 0) return [];
  const all = await db.select({ code: roles.code }).from(roles);
  const existing = new Set(all.map((r) => r.code));
  return codes.filter((c) => !existing.has(c));
}
