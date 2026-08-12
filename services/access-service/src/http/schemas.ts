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

export const CreateUserBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin'),
  fullName: z.string().min(1).max(128),
  password: z.string().min(8, 'Parola en az 8 karakter olmalı'),
  roleCodes: z.array(z.string()).default([]),
});
export type CreateUserBody = z.infer<typeof CreateUserBody>;

export const UpdateUserBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin').optional(),
  fullName: z.string().min(1).max(128).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserBody = z.infer<typeof UpdateUserBody>;

export const SetUserRolesBody = z.object({
  roleCodes: z.array(z.string()),
});
export type SetUserRolesBody = z.infer<typeof SetUserRolesBody>;

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
