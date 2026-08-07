import { UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { Response } from 'express';
import * as authService from '../../services/auth.service.ts';
import { LoginBody, RefreshBody } from '../schemas.ts';

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

  res.status(204).send();
}

export async function me(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  res.status(200).json(await authService.getCurrentUser(req.user.id));
}
