import { AUTH_COOKIE_NAMES, UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { Response } from 'express';
import * as authService from '../../services/auth.service.ts';
import { clearAuthCookies, setAuthCookies } from '../cookies.ts';
import { LoginBody } from '../schemas.ts';

function refreshTokenFromCookie(req: AuthedRequest): string {
  const token = req.cookies?.[AUTH_COOKIE_NAMES.REFRESH];
  if (typeof token !== 'string' || !token) throw new UnauthenticatedError('Refresh token bulunamadı');
  return token;
}

export async function login(req: AuthedRequest, res: Response): Promise<void> {
  const { email, password } = LoginBody.parse(req.body);
  const result = await authService.login(email, password);

  setAuthCookies(res, result);
  res.status(200).json({ user: result.user });
}

export async function refresh(req: AuthedRequest, res: Response): Promise<void> {
  const tokens = await authService.refresh(refreshTokenFromCookie(req));

  setAuthCookies(res, tokens);
  res.status(204).send();
}

export async function logout(req: AuthedRequest, res: Response): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE_NAMES.REFRESH];
  if (typeof token === 'string' && token) await authService.logout(token);

  clearAuthCookies(res);
  res.status(204).send();
}

export async function me(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  res.status(200).json(await authService.getCurrentUser(req.user.id));
}
