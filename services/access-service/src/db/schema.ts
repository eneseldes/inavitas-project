import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * access-service şeması — SRS 1.5 "Veritabanı: access_db".
 *
 * Buradaki foreign key'ler GERÇEK ve doğru: bu beş tablo aynı servise, aynı
 * veritabanına ait. FK yasağı yalnızca servis sınırını aşan referanslar için
 * geçerli (outages.work_order_id gibi).
 */

/**
 * CITEXT — büyük/küçük harf duyarsız metin.
 *
 * Drizzle'ın pg-core'unda hazır gelmiyor; uzantı tipi olduğu için kendimiz
 * tanımlıyoruz. Karşılaştırmayı veritabanı yaptığı için uygulama katmanında
 * toLowerCase() yapmayı unutma riski ortadan kalkıyor.
 */
const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: citext('email').notNull().unique(),
  passwordHash: varchar('password_hash').notNull(),
  fullName: varchar('full_name', { length: 128 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),

  // Brute-force koruması (FR-1.5): 5 başarısız denemede 15 dk kilit.
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 64 }).notNull(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 64 }).notNull().unique(),
});

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

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

/**
 * İlişki tanımları — yalnızca Drizzle'ın `db.query` API'si için.
 *
 * Veritabanındaki FK'ları yukarıdaki `references()` çağrıları kuruyor;
 * buradakiler tip seviyesinde "bu tablodan şuna gidebilirsin" bilgisi.
 */
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
