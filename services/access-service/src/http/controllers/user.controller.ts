import { asyncHandler, parseSort, PERMISSIONS, requirePermission, toExclusiveUpperBound, type AuthedRequest } from '@inavitas/shared';
import { Router } from 'express';
import type { Response } from 'express';
import * as userRepository from '../../repository/user.repository.ts';
import * as userService from '../../services/user.service.ts';
import {
  CreateUserBody,
  ListUsersQuery,
  ResetPasswordBody,
  SetUserAssignmentsBody,
  UpdateUserBody,
} from '../schemas.ts';
import { authenticate } from '../authenticate.ts';

export function buildUserRouter(): Router {
  const router = Router();

  const auth = [authenticate(), requirePermission(PERMISSIONS.USER_MANAGE)];
  // Kapsam atamak ayrı bir izindir: kullanıcı yönetebilen herkes bölge yetkisi dağıtamaz.
  const scopeAuth = [...auth, requirePermission(PERMISSIONS.SCOPE_MANAGE)];

  /** Sayfalı kullanıcı listesi */
  router.get(
    '/',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const query = ListUsersQuery.parse(req.query);
      const sort = parseSort(query.sort, ['email', 'fullName', 'lastLoginAt'], { field: 'lastLoginAt', dir: 'desc' });

      const result = await userRepository.list(
        {
          q: query.q,
          isActive: query.isActive,
          email: query.email,
          roles: query.roles,
          lastLoginAtFrom: query.lastLoginAtFrom ? new Date(query.lastLoginAtFrom) : undefined,
          lastLoginAtTo: query.lastLoginAtTo ? toExclusiveUpperBound(query.lastLoginAtTo) : undefined,
        },
        { page: query.page, pageSize: query.pageSize },
        sort,
      );
      res.json(result);
    }),
  );

  /** Tek kullanıcı detayı */
  router.get(
    '/:id',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = req.params.id as string;
      const user = await userRepository.findById(id);
      if (!user) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kullanıcı bulunamadı' } });
        return;
      }
      const { passwordHash: _, failedAttempts: __, lockedUntil: ___, ...publicUser } = user;
      res.json(publicUser);
    }),
  );

  /** Yeni kullanıcı oluştur */
  router.post(
    '/',
    ...scopeAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = CreateUserBody.parse(req.body);
      const id = await userService.createUser(req.user!, body);
      res.status(201).json({ id });
    }),
  );

  /** Kullanıcı güncelle */
  router.patch(
    '/:id',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = req.params.id as string;
      const body = UpdateUserBody.parse(req.body);
      await userService.updateUser(id, req.user!.id, body);
      res.status(204).send();
    }),
  );

  /** Kullanıcı rol atamalarını (rol + kapsam) değiştir */
  router.put(
    '/:id/roles',
    ...scopeAuth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = req.params.id as string;
      const { assignments } = SetUserAssignmentsBody.parse(req.body);
      await userService.setUserAssignments(req.user!, id, assignments);
      res.status(204).send();
    }),
  );

  /** Admin parola sıfırla */
  router.post(
    '/:id/password',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = req.params.id as string;
      const { password } = ResetPasswordBody.parse(req.body);
      await userService.resetPassword(id, password);
      res.status(204).send();
    }),
  );

  return router;
}
