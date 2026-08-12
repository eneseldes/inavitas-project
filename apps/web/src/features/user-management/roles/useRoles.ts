import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRole,
  deleteRole,
  fetchPermissions,
  fetchRole,
  fetchRoles,
  patchRole,
  setRolePermissions,
} from '../api.ts';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

export function useRoles() {
  return useQuery({
    queryKey: [ROLES_KEY],
    queryFn: fetchRoles,
  });
}

export function useRole(id: string | undefined) {
  return useQuery({
    queryKey: [ROLES_KEY, 'detail', id],
    queryFn: () => fetchRole(id!),
    enabled: id !== undefined,
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: [PERMISSIONS_KEY],
    queryFn: fetchPermissions,
    staleTime: 10 * 60 * 1000, // izinler nadiren değişir
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROLES_KEY] }),
  });
}

export function usePatchRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Parameters<typeof patchRole>[1] & { id: string }) =>
      patchRole(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROLES_KEY] }),
  });
}

export function useSetRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissionCodes }: { id: string; permissionCodes: string[] }) =>
      setRolePermissions(id, permissionCodes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROLES_KEY] }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ROLES_KEY] }),
  });
}
