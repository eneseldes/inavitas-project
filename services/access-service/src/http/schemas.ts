import { z } from 'zod';

/** HTTP istek gövdelerinin şemaları. Doğrulama sınırda yapılır, içeride değil. */

export const LoginBody = z.object({
  email: z.email('Geçerli bir e-posta adresi girin'),
  // Burada min(8) gibi bir kural YOK: giriş sırasında parola politikası
  // uygulamak, eski kullanıcıları kilitlemenin yanı sıra "bu parola çok kısa"
  // diyerek saldırgana bilgi verir. Politika yalnızca kayıt/değiştirmede.
  password: z.string().min(1, 'Parola zorunlu'),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const RefreshBody = z.object({
  refreshToken: z.string().min(1, 'refreshToken zorunlu'),
});
export type RefreshBody = z.infer<typeof RefreshBody>;
