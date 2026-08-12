import { apiFetch } from '../../shared/api/client.ts';
import type { PageResult } from '../../types/api.ts';
import type {
  CreateRoleInput,
  CreateUserInput,
  PermissionItem,
  RoleDetail,
  RoleListItem,
  UpdateRoleInput,
  UpdateUserInput,
  UserDetail,
  UserListItem,
} from '../../types/user-management.ts';

export interface UsersQuery {
  page: number;
  pageSize: number;
  sort?: string;
  q?: string;
  isActive?: boolean;
}

function buildUserQuery(q: UsersQuery): string {
  const params = new URLSearchParams({
    page: String(q.page),
    pageSize: String(q.pageSize),
  });
  if (q.sort) params.set('sort', q.sort);
  if (q.q) params.set('q', q.q);
  if (q.isActive !== undefined) params.set('isActive', String(q.isActive));
  return params.toString();
}

// --- Users ---

export function fetchUsers(query: UsersQuery): Promise<PageResult<UserListItem>> {
  return apiFetch(`/api/users?${buildUserQuery(query)}`);
}

export function fetchUser(id: string): Promise<UserDetail> {
  return apiFetch(`/api/users/${id}`);
}

export function createUser(input: CreateUserInput): Promise<{ id: string }> {
  return apiFetch('/api/users', { method: 'POST', body: input });
}

export function patchUser(id: string, body: UpdateUserInput): Promise<void> {
  return apiFetch(`/api/users/${id}`, { method: 'PATCH', body });
}

export function setUserRoles(id: string, roleCodes: string[]): Promise<void> {
  return apiFetch(`/api/users/${id}/roles`, { method: 'PUT', body: { roleCodes } });
}

export function resetPassword(id: string, password: string): Promise<void> {
  return apiFetch(`/api/users/${id}/password`, { method: 'POST', body: { password } });
}

// --- Roles ---

export function fetchRoles(): Promise<{ items: RoleListItem[] }> {
  return apiFetch('/api/roles');
}

export function fetchRole(id: string): Promise<RoleDetail> {
  return apiFetch(`/api/roles/${id}`);
}

export function createRole(input: CreateRoleInput): Promise<{ id: string }> {
  return apiFetch('/api/roles', { method: 'POST', body: input });
}

export function patchRole(id: string, body: UpdateRoleInput): Promise<void> {
  return apiFetch(`/api/roles/${id}`, { method: 'PATCH', body });
}

export function setRolePermissions(id: string, permissionCodes: string[]): Promise<void> {
  return apiFetch(`/api/roles/${id}/permissions`, { method: 'PUT', body: { permissionCodes } });
}

export function deleteRole(id: string): Promise<void> {
  return apiFetch(`/api/roles/${id}`, { method: 'DELETE' });
}

// --- Permissions ---

export function fetchPermissions(): Promise<{ items: PermissionItem[] }> {
  return apiFetch('/api/permissions');
}
