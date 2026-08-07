import { baseEnvSchema, kafkaEnvSchema, loadConfig } from '@inavitas/shared';
import { z } from 'zod';

/** İş emri servisi (work-order-service) ortam değişkenleri şeması. */
const envSchema = baseEnvSchema.merge(kafkaEnvSchema).extend({
  WORK_ORDER_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  WORK_ORDER_APP_DATABASE_URL: z.string().startsWith('postgresql://'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'work-order-service');
