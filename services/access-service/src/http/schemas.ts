import { z } from 'zod';

/** Giriş yapma HTTP istek gövdesi şeması. */
export const LoginBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Parola zorunlu'),
});
export type LoginBody = z.infer<typeof LoginBody>;

/** Token yenileme HTTP istek gövdesi şeması. */
export const RefreshBody = z.object({
  refreshToken: z.string().min(1, 'refreshToken zorunlu'),
});
export type RefreshBody = z.infer<typeof RefreshBody>;
