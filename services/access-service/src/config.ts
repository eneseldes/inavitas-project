import { baseEnvSchema, loadConfig } from '@edas/shared';
import { z } from 'zod';

/**
 * access-service'in ihtiyaç duyduğu env değişkenleri.
 *
 * Ortak httpEnvSchema'yı kullanmıyoruz: o `PORT` bekliyor, bizim kök .env'de
 * her servisin portu ayrı isimle duruyor (ACCESS_SERVICE_PORT) — böylece tüm
 * servisler tek .env dosyasını paylaşabiliyor.
 */
const envSchema = baseEnvSchema.extend({
  ACCESS_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  // Servisin kendisi migrator (DDL) kimliğini hiç görmez — sadece DML
  // yetkili runtime kullanıcısıyla bağlanır. Migrator URL'i (ACCESS_DATABASE_URL)
  // `drizzle-kit migrate` ve seed script'i tarafından process.env üzerinden
  // doğrudan okunur, bu şemaya dahil değildir.
  ACCESS_APP_DATABASE_URL: z.string().startsWith('postgresql://'),

  // 32 karakterin altındaki bir HS256 secret'ı kaba kuvvetle kırılabilir.
  // Servisin açılmasını engellemek, zayıf secret'la çalışmasından iyidir (NFR-5).
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'access-service');
