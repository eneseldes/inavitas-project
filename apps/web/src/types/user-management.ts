export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
  lastLoginAt: string | null;
}

export interface UserDetail {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
}

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

export interface PermissionItem {
  code: string;
  description: string | null;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  password: string;
  roleCodes: string[];
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  isActive?: boolean;
}

export interface CreateRoleInput {
  name: string;
  permissionCodes: string[];
}

export interface UpdateRoleInput {
  name: string;
}
