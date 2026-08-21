import {
  ALL_PERMISSIONS,
  PERMISSION_MODULES,
  ROLE_PERMISSIONS,
  ROLES,
  ROOT_UNIT_PATH,
  type Permission,
  type PermissionModule,
  type Role,
} from '@inavitas/shared';
import { eq, notInArray } from 'drizzle-orm';
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
  NETWORK_VIEWER: 'Şebeke İzleyici',
  FIELD_OPERATOR: 'Saha Operatörü',
  DISPATCHER: 'Dağıtım Sorumlusu',
};

/** İzin açıklamaları (UI'da rol editöründe gösterilir). */
const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'outage:read': 'Kesinti kayıtlarını görme',
  'outage:write': 'Kesinti oluşturma ve düzenle',
  'workorder:read': 'İş emirlerini görme',
  'workorder:write': 'İş emri oluşturma ve durum güncelleme',
  'user:manage': 'Kullanıcı ve rol yönetimi',
  'scope:manage': 'Kullanıcılara bölgesel yetki kapsamı atama',
  'translation:read': 'Çeviri yönetimini görme',
  'translation:write': 'Çeviri ekleme ve düzenle',
  'translation:publish': 'Çeviri yayınlama',
  'network:read': 'Şebeke ve idari birim verilerini görme',
  'network:trace': 'Besleme zinciri ve etki izi sorgulama',
  'network:switch': 'Anahtar işletme (manevra)',
  'customer:read': 'Abone verilerini görme (PII hariç)',
  'customer:read-pii': 'Abone tesisat/sözleşme numarasını görme',
};

/** Test kullanıcıları — SADECE geliştirme içindir. */
const SEED_USERS = [
  { email: 'admin@inavitas.com', password: 'Admin123!', fullName: 'Ahmet Yılmaz', role: ROLES.ADMIN, unitPath: ROOT_UNIT_PATH },
  { email: 'kesinti@inavitas.com', password: 'Kesinti123!', fullName: 'Mehmet Demir', role: ROLES.OUTAGE_OPERATOR, unitPath: ROOT_UNIT_PATH },
  { email: 'isemri@inavitas.com', password: 'IsEmri123!', fullName: 'Ayşe Kaya', role: ROLES.WORK_ORDER_OPERATOR, unitPath: ROOT_UNIT_PATH },
] as const;

async function main(): Promise<void> {
  // 1. İzinler — tek kaynak `PERMISSION_MODULES` (bkz. packages/shared/src/auth.ts).
  //    Liste ROL eşlemesinden türetilmez: hiçbir role atanmamış bir izin de tabloda
  //    olmalı, aksi halde rol panelinde hiç görünmez ve kimseye verilemez.
  let sortOrder = 0;
  for (const [module, codes] of Object.entries(PERMISSION_MODULES) as [PermissionModule, readonly Permission[]][]) {
    for (const code of codes) {
      const values = { code, description: PERMISSION_DESCRIPTIONS[code], module, sortOrder: sortOrder++ };
      await db.insert(permissions).values(values).onConflictDoUpdate({
        target: permissions.code,
        set: { description: values.description, module: values.module, sortOrder: values.sortOrder },
      });
    }
  }

  // 2. Sözlükten düşmüş izinleri temizle. Upsert bir satırı asla silmez; kaldırılan izin
  //    `permissions` ve `role_permissions` tablolarında yaşamaya devam eder, `GET /permissions`
  //    onu döndürür ve rol panelinde hayalet bir satır olarak görünür.
  const stale = await db
    .delete(permissions)
    .where(notInArray(permissions.code, [...ALL_PERMISSIONS]))
    .returning({ code: permissions.code });

  // 3. Roller ve izin eşlemeleri
  for (const [code, rolePerms] of Object.entries(ROLE_PERMISSIONS) as [Role, readonly string[]][]) {
    const [role] = await db
      .insert(roles)
      .values({ code, name: ROLE_NAMES[code], isSystem: true })
      .onConflictDoUpdate({ target: roles.code, set: { name: ROLE_NAMES[code], isSystem: true } })
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

  // 4. Kullanıcılar
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
      .values({ userId: user!.id, roleId: role.id, unitPath: seedUser.unitPath })
      .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId, userRoles.unitPath] });
  }

  console.log(
    `Seed tamam: ${ALL_PERMISSIONS.length} izin, ${stale.length} eskimiş izin silindi, ${Object.keys(ROLE_PERMISSIONS).length} rol, ${SEED_USERS.length} kullanıcı.`,
  );
  console.log('Giriş bilgileri:');
  for (const u of SEED_USERS) console.log(`  ${u.email.padEnd(20)} ${u.password.padEnd(13)} → ${u.role} @ ${u.unitPath}`);
}

main()
  .catch((err: unknown) => {
    console.error('Seed başarısız:', err);
    process.exit(1);
  })
  .finally(() => void pool.end());
