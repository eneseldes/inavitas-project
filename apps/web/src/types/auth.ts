import type { AssignmentDetail } from './user-management.ts';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  /** İzin → yetkili olunan idari birim yolları. Kullanıcı kartındaki rol@birim satırı bundan gelir. */
  scopes: Record<string, string[]>;
  assignments: AssignmentDetail[];
}

export interface LoginResponse {
  user: AuthUser;
}
