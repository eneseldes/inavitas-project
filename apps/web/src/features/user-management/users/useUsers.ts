import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUser,
  fetchUser,
  fetchUsers,
  patchUser,
  resetPassword,
  setUserAssignments,
  type UsersQuery,
} from '../api.ts';
import type { Assignment } from '../../../types/user-management.ts';

export const USERS_KEY = 'users';

export function useUsers(query: UsersQuery) {
  return useQuery({
    queryKey: [USERS_KEY, query],
    queryFn: () => fetchUsers(query),
    placeholderData: keepPreviousData,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: [USERS_KEY, 'detail', id],
    queryFn: () => fetchUser(id!),
    enabled: id !== undefined,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] }),
  });
}

export function usePatchUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Parameters<typeof patchUser>[1] & { id: string }) =>
      patchUser(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] }),
  });
}

export function useSetUserAssignments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignments }: { id: string; assignments: Assignment[] }) =>
      setUserAssignments(id, assignments),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetPassword(id, password),
  });
}
