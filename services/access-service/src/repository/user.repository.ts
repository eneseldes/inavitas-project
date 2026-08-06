import { eq } from 'drizzle-orm';
import { db } from '../db.ts';
import { users } from '../db/schema.ts';
import type { LockState } from '../domain/lockout.ts';

/**
 * Kullanıcı sorguları. Drizzle'ı yalnızca bu katman bilir; servis katmanı
 * düz nesnelerle çalışır.
 */

/** Rolleri ve izinleriyle birlikte kullanıcı. */
export interface UserWithAccess {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  roles: string[];
  permissions: string[];
}

/** İç içe rol → izin ilişkisini `db.query` ile bir seferde çeker. */
const withAccess = {
  userRoles: { with: { role: { with: { rolePermissions: { with: { permission: true } } } } } },
} as const;

type UserRow = NonNullable<
  Awaited<ReturnType<typeof db.query.users.findFirst<{ with: typeof withAccess }>>>
>;

/**
 * İç içe rol → izin ilişkisini düz iki listeye indirger.
 *
 * İzinler `Set` üzerinden geçiyor: iki rolü olan bir kullanıcıda ortak
 * izinler tekrarlanır ve JWT'de aynı izin iki kez yer alır.
 */
function toUserWithAccess(row: UserRow): UserWithAccess {
  const roles = row.userRoles.map((ur) => ur.role.code);
  const permissions = new Set<string>();

  for (const userRole of row.userRoles) {
    for (const rp of userRole.role.rolePermissions) {
      permissions.add(rp.permission.code);
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
    roles,
    permissions: [...permissions],
  };
}

/**
 * E-posta ile kullanıcı bulur.
 *
 * Küçük/büyük harf normalizasyonu YAPMIYORUZ: `email` sütunu CITEXT,
 * karşılaştırmayı veritabanı harf duyarsız yapıyor.
 */
export async function findByEmail(email: string): Promise<UserWithAccess | null> {
  const row = await db.query.users.findFirst({ where: eq(users.email, email), with: withAccess });
  return row ? toUserWithAccess(row) : null;
}

export async function findById(id: string): Promise<UserWithAccess | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, id), with: withAccess });
  return row ? toUserWithAccess(row) : null;
}

/** Başarılı/başarısız giriş sonrası kilit durumunu yazar. */
export async function updateLockState(userId: string, state: LockState): Promise<void> {
  await db
    .update(users)
    .set({ failedAttempts: state.failedAttempts, lockedUntil: state.lockedUntil })
    .where(eq(users.id, userId));
}
