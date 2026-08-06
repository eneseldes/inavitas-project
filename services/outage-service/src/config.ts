import { baseEnvSchema, loadConfig } from '@edas/shared';
import { z } from 'zod';

/**
 * outage-service'in ihtiyaç duyduğu env değişkenleri.
 *
 * JWT_SECRET burada YOK: bu servis JWT doğrulamaz, gateway'in eklediği
 * `X-User-*` header'larına güvenir (packages/shared authenticateFromHeaders).
 */
const envSchema = baseEnvSchema.extend({
  OUTAGE_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3002),

  // Servis migrator (DDL) kimliğini hiç görmez — yalnızca DML yetkili runtime
  // kullanıcısıyla bağlanır. Migrator URL'i (OUTAGE_DATABASE_URL) drizzle-kit
  // tarafından process.env üzerinden doğrudan okunur, bu şemaya dahil değil.
  OUTAGE_APP_DATABASE_URL: z.string().startsWith('postgresql://'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'outage-service');
