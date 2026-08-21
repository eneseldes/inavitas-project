import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Büyük/küçük harf duyarsız metin tipi (CITEXT - PostgreSQL).
 * E-posta adreslerinin duyarsız saklanması ve sorgulanması için kullanılır.
 */
const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/**
 * PostgreSQL `ltree` tipi — idari birim yolu (`TR.06.012.0137`). `network_db`'deki ile
 * birebir aynı tiptir; kapsam kontrolü (`unit_path <@ ANY(...)`) JOIN'siz cevaplanır.
 */
export const ltree = customType<{ data: string }>({
  dataType: () => 'ltree',
});

/** Kullanıcılar tablosu. */
export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: citext('email').notNull().unique(),
  passwordHash: varchar('password_hash').notNull(),
  fullName: varchar('full_name', { length: 128 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),

  /** Başarısız giriş denemeleri sayısı ve hesap kilitleme süresi. */
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),

  /** En son başarılı girişin zamanı — hiç giriş yapmadıysa null. */
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

  /**
   * Kapsam kümesinin sürümü — her rol/kapsam değişikliğinde artar. Token bu değeri claim
   * olarak taşır; gateway artmış bir sürüm görürse `SCOPE_STALE` ile reddeder. Aksi halde
   * kapsamı daraltılan kullanıcı token süresi dolana kadar eski kapsamıyla çalışırdı.
   */
  scopeVersion: integer('scope_version').notNull().default(1),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Roller tablosu (ör. ADMIN, OUTAGE_OPERATOR). */
export const roles = pgTable('roles', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 64 }).notNull(),
  /** Seed'den gelen sistem rolleri silinemez/düzenlenemez. */
  isSystem: boolean('is_system').notNull().default(false),
});

/** İzinler tablosu (ör. outage:read, outage:write). */
export const permissions = pgTable('permissions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 64 }).notNull().unique(),
  description: varchar('description', { length: 128 }),
  /**
   * Rol panelindeki kutu. İzin kodunun önekinden TÜRETİLMEZ — abone izinleri `customer:`
   * ön ekini taşır ama şebeke modülünde görünür (bkz. PERMISSION_MODULES).
   */
  module: varchar('module', { length: 32 }).notNull(),
  /** Modül içindeki sabit satır sırası; seed `PERMISSION_MODULES` dizisinden yazar. */
  sortOrder: integer('sort_order').notNull().default(0),
});

/** Rol-İzin ilişki tablosu (Çoka-Çok). */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

/**
 * Kullanıcı-Rol ataması. Kapsam ayrı bir tabloda değil, atamanın bir **kolonudur**:
 * yetkiyi veren kişi izinleri tek tek değil rol olarak düşünür ("Veli saha operatörü, ama
 * sadece Yenimahalle'de"). Aynı rol farklı birimlerde birden çok kez verilebilir; aynı rol
 * aynı birimde iki kez verilemez — birincil anahtar bunu garanti eder.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    unitPath: ltree('unit_path').notNull(),
    /** İsteğe bağlı geçici yetki; null ise atama süresizdir. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId, table.unitPath] })],
);

/**
 * İdari birim ağacının read-model'i — `network_db`'den tek seferlik seed edilir
 * (`db/seed/units-ro.ts`, bir deploy adımıdır). Cross-DB foreign key yoktur; kapsam atarken
 * "bu birim var mı" sorusu senkron bir HTTP çağrısıyla değil buradan cevaplanır.
 */
export const unitsRo = pgTable(
  'units_ro',
  {
    path: ltree('path').primaryKey(),
    parentPath: ltree('parent_path'),
    level: varchar('level', { length: 32 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    provinceName: varchar('province_name', { length: 255 }).notNull(),
    districtName: varchar('district_name', { length: 255 }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_units_ro_parent').on(table.parentPath), index('idx_units_ro_name').on(table.name)],
);

/** Drizzle ORM ilişki (relations) tanımları. */
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));
