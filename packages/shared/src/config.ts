import { z } from 'zod';

/** Ortak servis ortam değişkenleri şeması. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/** Kafka yapılandırma şeması. */
export const kafkaEnvSchema = z.object({
  KAFKA_BROKERS: z
    .string()
    .min(1)
    .transform((s) => s.split(',').map((b) => b.trim())),
  KAFKA_CLIENT_ID: z.string().min(1),
});

/** Redis yapılandırma şeması. */
export const redisEnvSchema = z.object({
  REDIS_URL: z.url(),
});

/** PostgreSQL yapılandırma şeması. */
export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
});

/** HTTP port yapılandırma şeması. */
export const httpEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
});

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Ortam değişkenlerini verilen Zod şemasıyla doğrular ve tipli konfigürasyon nesnesi döner.
 * Hata durumunda eksik/geçersiz değişkenleri konsola basarak uygulamayı durdurur.
 */
export function loadConfig<TSchema extends z.ZodType>(
  schema: TSchema,
  serviceName: string,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(env);

  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(kök)';
      return `  - ${name}: ${issue.message}`;
    });

    console.error(
      `\n[${serviceName}] Ortam değişkenleri geçersiz — servis başlatılmıyor:\n` +
        lines.join('\n') +
        `\n\n.env dosyanı kontrol et (.env.example ile karşılaştır).\n`,
    );
    throw new ConfigError(`${serviceName}: geçersiz ortam değişkenleri`);
  }

  return result.data;
}

/** Geliştirme ortamında (development) olunup olunmadığını kontrol eder. */
export function isDevelopment(nodeEnv: string): boolean {
  return nodeEnv === 'development';
}
