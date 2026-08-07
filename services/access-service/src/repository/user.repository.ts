import { eq } from 'drizzle-orm';
import { db } from '../db.ts';
import { users } from '../db/schema.ts';
import type { LockState } from '../domain/lockout.ts';

/** Roller ve izinler eklenmiş kullanıcı veri yapısı. */
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

const withAccess = {
  userRoles: { with: { role: { with: { rolePermissions: { with: { permission: true } } } } } },
} as const;

type UserRow = NonNullable<
  Awaited<ReturnType<typeof db.query.users.findFirst<{ with: typeof withAccess }>>>
>;

/** Veritabanı ilişki satırlarını düz roller ve benzersiz izin dizilerine dönüştürür. */
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

/** Kullanıcının kilit durumunu ve başarısız deneme sayısını günceller. */
export async function updateLockState(userId: string, state: LockState): Promise<void> {
  await db
    .update(users)
    .set({ failedAttempts: state.failedAttempts, lockedUntil: state.lockedUntil })
    .where(eq(users.id, userId));
}
