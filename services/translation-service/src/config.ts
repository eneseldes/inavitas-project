import { baseEnvSchema, kafkaEnvSchema, loadConfig, redisEnvSchema } from '@inavitas/shared';
import { z } from 'zod';

const envSchema = baseEnvSchema.merge(kafkaEnvSchema).merge(redisEnvSchema).extend({
  TRANSLATION_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3004),
  TRANSLATION_APP_DATABASE_URL: z.string().startsWith('postgresql://'),
  TRANSLATION_PROVIDER: z.enum(['none', 'deepl']).default('none'),
  DEEPL_API_KEY: z.string().optional(),
  MAX_AUTO_TRANSLATE_KEYS: z.coerce.number().int().min(1).default(50),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'translation-service');
