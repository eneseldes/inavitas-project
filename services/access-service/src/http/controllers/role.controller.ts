import { asyncHandler, PERMISSIONS, requirePermission, type AuthedRequest } from '@inavitas/shared';
import { Router } from 'express';
import type { Response } from 'express';
import * as roleRepository from '../../repository/role.repository.ts';
import * as roleService from '../../services/role.service.ts';
import { CreateRoleBody, SetPermissionsBody, UpdateRoleBody } from '../schemas.ts';
import { authenticate } from '../authenticate.ts';

export function buildRoleRouter(): Router {
  const router = Router();

  const auth = [authenticate(), requirePermission(PERMISSIONS.USER_MANAGE)];

  /** Tüm roller (izin/kullanıcı sayısıyla) */
  router.get(
    '/',
    ...auth,
    asyncHandler(async (_req: AuthedRequest, res: Response) => {
      const roles = await roleRepository.list();
      res.json({ items: roles });
    }),
  );

  /** Tek rol + izin kodları */
  router.get(
    '/:id',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = req.params.id as string;
      const role = await roleRepository.findById(id);
      if (!role) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rol bulunamadı' } });
        return;
      }
      res.json(role);
    }),
  );

  /** Yeni rol oluştur */
  router.post(
    '/',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const body = CreateRoleBody.parse(req.body);
      const id = await roleService.createRole(body);
      res.status(201).json({ id });
    }),
  );

  /** Rol adını güncelle */
  router.patch(
    '/:id',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = req.params.id as string;
      const { name } = UpdateRoleBody.parse(req.body);
      await roleService.updateRole(id, name);
      res.status(204).send();
    }),
  );

  /** Rolün izin setini değiştir */
  router.put(
    '/:id/permissions',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = req.params.id as string;
      const { permissionCodes } = SetPermissionsBody.parse(req.body);
      await roleService.setRolePermissions(id, permissionCodes);
      res.status(204).send();
    }),
  );

  /** Rolü sil */
  router.delete(
    '/:id',
    ...auth,
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const id = req.params.id as string;
      await roleService.deleteRole(id);
      res.status(204).send();
    }),
  );

  return router;
}
