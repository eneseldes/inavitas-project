import { baseEnvSchema, loadConfig, redisEnvSchema } from '@inavitas/shared';
import { z } from 'zod';

/**
 * Kimlik doğrulama servisi (access-service) ortam değişkenleri şeması.
 */
const envSchema = baseEnvSchema.merge(redisEnvSchema).extend({
  ACCESS_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  /** Runtime veritabanı bağlantı adresi (DML erişimli kullanıcı). */
  ACCESS_APP_DATABASE_URL: z.string().startsWith('postgresql://'),

  /** Güvenli JWT imzalaması için en az 32 karakterlik gizli anahtar (secret). */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en az 32 karakter olmalı'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = loadConfig(envSchema, 'access-service');
