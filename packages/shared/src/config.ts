import { z } from 'zod';

/**
 * Ortam değişkeni doğrulaması.
 *
 * Kural: eksik veya hatalı env varsa servis AÇILMAZ. Yarım yapılandırmayla
 * ayağa kalkıp üçüncü istekte "undefined is not a valid connection string"
 * ile patlamak, en baştan net bir hatayla durmaktan çok daha kötüdür.
 */

/** Her servisin ihtiyaç duyduğu ortak alanlar. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/** Kafka kullanan servisler bunu da birleştirir. */
export const kafkaEnvSchema = z.object({
  KAFKA_BROKERS: z
    .string()
    .min(1)
    .transform((s) => s.split(',').map((b) => b.trim())),
  KAFKA_CLIENT_ID: z.string().min(1),
});

/** Redis kullanan servisler. */
export const redisEnvSchema = z.object({
  REDIS_URL: z.url(),
});

/** Postgres kullanan servisler. Her servis KENDİ veritabanına bağlanır. */
export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://'),
});

/** HTTP sunan servisler. */
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
 * Env'i doğrular ve tipli config nesnesi döndürür.
 *
 * Hatalıysa hangi değişkenin neden geçersiz olduğunu satır satır yazıp
 * süreci sonlandırır. `.env` dosyasını unutmuş biri için en faydalı çıktı budur.
 *
 * @example
 * const envSchema = baseEnvSchema.merge(httpEnvSchema).merge(databaseEnvSchema);
 * export const config = loadConfig(envSchema, 'outage-service');
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

    // Logger'ı burada kullanmıyoruz: config yüklenmeden logger'ı da
    // yapılandıramayız. Bu, console.error'ın haklı olduğu tek yer.
    console.error(
      `\n[${serviceName}] Ortam değişkenleri geçersiz — servis başlatılmıyor:\n` +
        lines.join('\n') +
        `\n\n.env dosyanı kontrol et (.env.example ile karşılaştır).\n`,
    );
    throw new ConfigError(`${serviceName}: geçersiz ortam değişkenleri`);
  }

  return result.data;
}

/** `config.NODE_ENV === 'development'` yazmaktan kısa yol. */
export function isDevelopment(nodeEnv: string): boolean {
  return nodeEnv === 'development';
}
