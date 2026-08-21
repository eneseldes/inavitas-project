import { PaginationQuery } from '@inavitas/shared';
import { z } from 'zod';

/** Giriş yapma HTTP istek gövdesi şeması. */
export const LoginBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Parola zorunlu'),
});
export type LoginBody = z.infer<typeof LoginBody>;

// --- Kullanıcı yönetimi ---

const csv = z
  .string()
  .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean));

export const ListUsersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
  q: z.string().optional(),
  email: z.string().optional(),
  roles: csv.optional(),
  lastLoginAtFrom: z.string().optional(),
  lastLoginAtTo: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuery>;

/**
 * Rol ataması — kapsam rolün yanında taşınır. `unit_path` bir ltree yolu olduğundan
 * yalnız harf/rakam/alt çizgi ve nokta içerebilir; serbest metin kabul edilirse ilerideki
 * `::ltree` cast'i sorgu zamanında patlar.
 */
export const Assignment = z.object({
  roleCode: z.string().min(1),
  unitPath: z.string().regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/, 'Geçersiz birim yolu'),
});
export type Assignment = z.infer<typeof Assignment>;

export const CreateUserBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin'),
  fullName: z.string().min(1).max(128),
  password: z.string().min(8, 'Parola en az 8 karakter olmalı'),
  assignments: z.array(Assignment).default([]),
});
export type CreateUserBody = z.infer<typeof CreateUserBody>;

export const UpdateUserBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin').optional(),
  fullName: z.string().min(1).max(128).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserBody = z.infer<typeof UpdateUserBody>;

export const SetUserAssignmentsBody = z.object({
  assignments: z.array(Assignment),
});
export type SetUserAssignmentsBody = z.infer<typeof SetUserAssignmentsBody>;

export const ResetPasswordBody = z.object({
  password: z.string().min(8, 'Parola en az 8 karakter olmalı'),
});
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>;

// --- Rol yönetimi ---

export const CreateRoleBody = z.object({
  name: z.string().min(1).max(64),
  permissionCodes: z.array(z.string()).default([]),
});
export type CreateRoleBody = z.infer<typeof CreateRoleBody>;

export const UpdateRoleBody = z.object({
  name: z.string().min(1).max(64),
});
export type UpdateRoleBody = z.infer<typeof UpdateRoleBody>;

export const SetPermissionsBody = z.object({
  permissionCodes: z.array(z.string()),
});
export type SetPermissionsBody = z.infer<typeof SetPermissionsBody>;

// --- Birim ağacı ---

/**
 * Birim ağacı sorgusu. `parent` verilmezse kökler döner; `q` verilirse ağaç değil arama
 * sonucu (eşleşmeler + ataları) döner — arama sunucu tarafındadır.
 */
export const UnitTreeQuery = PaginationQuery.extend({
  parent: z.string().optional(),
  q: z.string().min(1).optional(),
});
export type UnitTreeQuery = z.infer<typeof UnitTreeQuery>;
