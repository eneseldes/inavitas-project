export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

export interface LoginResponse {
  user: AuthUser;
}
