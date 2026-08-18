import { baseEnvSchema, loadConfig, redisEnvSchema } from '@inavitas/shared';
import { z } from 'zod';

/** API Gateway servisi ortam değişkenleri şeması. */
const envSchema = baseEnvSchema.merge(redisEnvSchema).extend({
  GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),

  // *_HOST varsayılanı 'localhost' — host'ta `npm run dev` ile çalışırken hiç
  // değişiklik gerekmez. Container'da çalışırken (docker-compose.yml) compose
  // servis adlarıyla (`access-service` vb.) ezilir; aksi halde gateway
  // container'ı kendi 'localhost'una (yani kendi içine) istek atmaya çalışır.
  ACCESS_SERVICE_HOST: z.string().default('localhost'),
  ACCESS_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  OUTAGE_SERVICE_HOST: z.string().default('localhost'),
  OUTAGE_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  WORK_ORDER_SERVICE_HOST: z.string().default('localhost'),
  WORK_ORDER_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  TRANSLATION_SERVICE_HOST: z.string().default('localhost'),
  TRANSLATION_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3004),
  NETWORK_SERVICE_HOST: z.string().default('localhost'),
  NETWORK_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3005),

  /** İzin verilen CORS kök adresi. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'gateway');

/** Downstream mikroservis hedef adresleri. */
export const SERVICE_TARGETS = {
  access: `http://${config.ACCESS_SERVICE_HOST}:${config.ACCESS_SERVICE_PORT}`,
  outage: `http://${config.OUTAGE_SERVICE_HOST}:${config.OUTAGE_SERVICE_PORT}`,
  workOrder: `http://${config.WORK_ORDER_SERVICE_HOST}:${config.WORK_ORDER_SERVICE_PORT}`,
  translation: `http://${config.TRANSLATION_SERVICE_HOST}:${config.TRANSLATION_SERVICE_PORT}`,
  network: `http://${config.NETWORK_SERVICE_HOST}:${config.NETWORK_SERVICE_PORT}`,
} as const;
