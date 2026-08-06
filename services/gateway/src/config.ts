import { baseEnvSchema, loadConfig } from '@edas/shared';
import { z } from 'zod';

/**
 * gateway'in ihtiyaç duyduğu env değişkenleri.
 *
 * JWT_SECRET access-service ile AYNI değeri okur — gateway JWT'yi burada,
 * merkezi olarak doğrular (02-MIMARI ADR #5); downstream servisler (outage,
 * work-order) bir daha doğrulamaz, gateway'in eklediği X-User-* header'larına
 * güvenir (bkz. packages/shared authenticateFromHeaders).
 */
const envSchema = baseEnvSchema.extend({
  GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),

  ACCESS_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  OUTAGE_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  WORK_ORDER_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3003),

  // Faz 3'te tek istemci var: Vite dev server. `credentials: true` ile
  // birlikte '*' KULLANILAMAZ — tarayıcı reddeder, tam eşleşme zorunlu.
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'gateway');

/** Downstream servis hedefleri. Servisler kendi portlarını `localhost`ta dinler. */
export const SERVICE_TARGETS = {
  access: `http://localhost:${config.ACCESS_SERVICE_PORT}`,
  outage: `http://localhost:${config.OUTAGE_SERVICE_PORT}`,
  workOrder: `http://localhost:${config.WORK_ORDER_SERVICE_PORT}`,
} as const;
