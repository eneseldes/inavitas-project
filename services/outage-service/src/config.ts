import { baseEnvSchema, kafkaEnvSchema, loadConfig, redisEnvSchema } from '@inavitas/shared';
import { z } from 'zod';

/** Kesinti yönetimi servisi (outage-service) ortam değişkenleri şeması. */
const envSchema = baseEnvSchema.merge(kafkaEnvSchema).merge(redisEnvSchema).extend({
  OUTAGE_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3002),

  /** Runtime veritabanı bağlantı adresi. */
  OUTAGE_APP_DATABASE_URL: z.string().startsWith('postgresql://'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'outage-service');
