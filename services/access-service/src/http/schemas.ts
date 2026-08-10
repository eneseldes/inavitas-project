import { z } from 'zod';

/** Giriş yapma HTTP istek gövdesi şeması. */
export const LoginBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Parola zorunlu'),
});
export type LoginBody = z.infer<typeof LoginBody>;
