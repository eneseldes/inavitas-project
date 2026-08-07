import { ROLE_PERMISSIONS, ROLES, type Role } from '@inavitas/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hashPassword } from '../domain/password.ts';
import { permissions, roles, rolePermissions, userRoles, users } from './schema.ts';

/**
 * Veritabanı başlangıç verilerini (seed) hazırlar.
 *
 * Yeniden çalıştırılabilir yapıdadır (`onConflictDoUpdate`). CLI betiği olarak
 * çalıştığından kendi veritabanı bağlantı havuzunu kullanır.
 */

const connectionString = process.env.ACCESS_DATABASE_URL;

if (!connectionString) {
  console.error('ACCESS_DATABASE_URL tanımlı değil — kök .env dosyanı kontrol et.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool);

const ROLE_NAMES: Record<Role, string> = {
  ADMIN: 'Yönetici',
  OUTAGE_OPERATOR: 'Kesinti Operatörü',
  WORK_ORDER_OPERATOR: 'Saha Personeli',
};

/** Test kullanıcıları — SADECE geliştirme içindir. */
const SEED_USERS = [
  { email: 'admin@inavitas.com', password: 'Admin123!', fullName: 'Ahmet Yılmaz', role: ROLES.ADMIN },
  { email: 'kesinti@inavitas.com', password: 'Kesinti123!', fullName: 'Mehmet Demir', role: ROLES.OUTAGE_OPERATOR },
  { email: 'isemri@inavitas.com', password: 'IsEmri123!', fullName: 'Ayşe Kaya', role: ROLES.WORK_ORDER_OPERATOR },
] as const;

async function main(): Promise<void> {
  // 1. İzinler — tek kaynak packages/shared'daki PERMISSIONS sabiti.
  //    Rol→izin eşlemesini elle tekrar yazmıyoruz ki kod ile veri ayrışmasın.
  const permissionCodes = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];

  for (const code of permissionCodes) {
    await db.insert(permissions).values({ code }).onConflictDoNothing({ target: permissions.code });
  }

  // 2. Roller ve izin eşlemeleri
  for (const [code, rolePerms] of Object.entries(ROLE_PERMISSIONS) as [Role, readonly string[]][]) {
    const [role] = await db
      .insert(roles)
      .values({ code, name: ROLE_NAMES[code] })
      .onConflictDoUpdate({ target: roles.code, set: { name: ROLE_NAMES[code] } })
      .returning();

    for (const permissionCode of rolePerms) {
      const [permission] = await db
        .select()
        .from(permissions)
        .where(eq(permissions.code, permissionCode));

      if (!permission) throw new Error(`İzin bulunamadı: ${permissionCode}`);

      await db
        .insert(rolePermissions)
        .values({ roleId: role!.id, permissionId: permission.id })
        .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionId] });
    }
  }

  // 3. Kullanıcılar
  for (const seedUser of SEED_USERS) {
    const passwordHash = await hashPassword(seedUser.password);

    const [user] = await db
      .insert(users)
      .values({ email: seedUser.email, passwordHash, fullName: seedUser.fullName })
      .onConflictDoUpdate({
        target: users.email,
        // Parolayı her seed'de yeniden yazıyoruz: geliştirici parolayı
        // değiştirdikten sonra "neden giremiyorum" ile uğraşmasın.
        set: { passwordHash, fullName: seedUser.fullName, isActive: true, failedAttempts: 0, lockedUntil: null },
      })
      .returning();

    const [role] = await db.select().from(roles).where(eq(roles.code, seedUser.role));
    if (!role) throw new Error(`Rol bulunamadı: ${seedUser.role}`);

    await db
      .insert(userRoles)
      .values({ userId: user!.id, roleId: role.id })
      .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
  }

  console.log(`Seed tamam: ${permissionCodes.length} izin, ${Object.keys(ROLE_PERMISSIONS).length} rol, ${SEED_USERS.length} kullanıcı.`);
  console.log('Giriş bilgileri:');
  for (const u of SEED_USERS) console.log(`  ${u.email.padEnd(20)} ${u.password.padEnd(13)} → ${u.role}`);
}

main()
  .catch((err: unknown) => {
    console.error('Seed başarısız:', err);
    process.exit(1);
  })
  .finally(() => void pool.end());
