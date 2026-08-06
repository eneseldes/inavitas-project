import { UnauthenticatedError, type AuthedRequest } from '@edas/shared';
import type { Response } from 'express';
import * as authService from '../../services/auth.service.ts';
import { LoginBody, RefreshBody } from '../schemas.ts';

/**
 * Controller'lar ince: gövdeyi doğrula → servisi çağır → cevabı biçimlendir.
 * İş mantığı burada olmaz (02-MIMARI 2.8).
 *
 * `parse` fırlatan ZodError'ı yakalamıyoruz — merkezi errorHandler onu
 * 400 + alan bazlı ayrıntıya çeviriyor (packages/shared/http.ts).
 */

export async function login(req: AuthedRequest, res: Response): Promise<void> {
  const { email, password } = LoginBody.parse(req.body);
  const result = await authService.login(email, password);

  res.status(200).json(result);
}

export async function refresh(req: AuthedRequest, res: Response): Promise<void> {
  const { refreshToken } = RefreshBody.parse(req.body);
  const tokens = await authService.refresh(refreshToken);

  res.status(200).json(tokens);
}

export async function logout(req: AuthedRequest, res: Response): Promise<void> {
  const { refreshToken } = RefreshBody.parse(req.body);
  await authService.logout(refreshToken);

  // 204: gövde yok. Çıkış her hâlükârda "başarılı" sayılır (FR-1.4).
  res.status(204).send();
}

export async function me(req: AuthedRequest, res: Response): Promise<void> {
  // authenticate() middleware'i olmadan buraya gelinemez; yine de tip
  // seviyesinde user opsiyonel olduğu için kontrol ediyoruz.
  if (!req.user) throw new UnauthenticatedError();

  res.status(200).json(await authService.getCurrentUser(req.user.id));
}
