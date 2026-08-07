import { baseEnvSchema, loadConfig, redisEnvSchema } from '@inavitas/shared';
import { z } from 'zod';

/** API Gateway servisi ortam değişkenleri şeması. */
const envSchema = baseEnvSchema.merge(redisEnvSchema).extend({
  GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),

  ACCESS_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  OUTAGE_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  WORK_ORDER_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3003),

  /** İzin verilen CORS kök adresi. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'gateway');

/** Downstream mikroservis hedef adresleri. */
export const SERVICE_TARGETS = {
  access: `http://localhost:${config.ACCESS_SERVICE_PORT}`,
  outage: `http://localhost:${config.OUTAGE_SERVICE_PORT}`,
  workOrder: `http://localhost:${config.WORK_ORDER_SERVICE_PORT}`,
} as const;
