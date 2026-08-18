import { baseEnvSchema, kafkaEnvSchema, loadConfig, redisEnvSchema } from '@inavitas/shared';
import { z } from 'zod';

/** CBS ve Şebeke servisi (network-service) ortam değişkenleri şeması. */
const envSchema = baseEnvSchema.merge(kafkaEnvSchema).merge(redisEnvSchema).extend({
  NETWORK_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3005),

  /** Runtime veritabanı bağlantı adresi. */
  NETWORK_APP_DATABASE_URL: z.string().startsWith('postgresql://'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'network-service');
