import pino, { type Logger } from 'pino';
import pinoPretty from 'pino-pretty';

export type { Logger };

/**
 * Loglardan asla çıkmaması gereken alanlar.
 *
 * Bir kez parola veya token loglandığında, o log dosyası artık gizli veri
 * içeriyor demektir; sonradan temizlemek pratikte imkânsızdır. Bu liste
 * bu yüzden geniş tutuldu.
 */
const REDACTED_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
];

export interface LoggerOptions {
  /** Log satırlarında görünecek servis adı. */
  service: string;
  level?: string;
  /** true ise okunabilir renkli çıktı (pino-pretty). Yalnızca geliştirmede. */
  pretty?: boolean;
}

/**
 * Servis kök logger'ını oluşturur.
 *
 * @example
 * export const logger = createLogger({
 *   service: 'outage-service',
 *   level: config.LOG_LEVEL,
 *   pretty: isDevelopment(config.NODE_ENV),
 * });
 */
export function createLogger({ service, level = 'info', pretty = false }: LoggerOptions): Logger {
  const fileStream = pino.destination({ dest: `logs/${service}.log`, mkdir: true });
  const consoleStream = pretty
    ? pinoPretty({ colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' })
    : process.stdout;

  return pino(
    {
      name: service,
      level,
      redact: { paths: REDACTED_PATHS, censor: '[GIZLENDI]' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label: string) => ({ level: label }),
      },
    },
    pino.multistream([
      { stream: fileStream, level },
      { stream: consoleStream, level },
    ]),
  );
}


/**
 * Yeni bir correlation id üretir. Gateway her gelen istekte bir kez çağırır;
 * sonra bu id HTTP header'ı ve Kafka event zarfı üzerinden tüm sisteme yayılır.
 */
export function newCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Bir isteğin/event'in tüm loglarına correlationId ekleyen alt logger üretir.
 *
 * Dağıtık sistemde hata ayıklamanın tek pratik yolu budur: tek bir
 * correlationId ile grep'leyip isteğin gateway'den Kafka consumer'ına
 * kadar tüm izini görürsün.
 *
 * @example
 * const log = withCorrelation(logger, evt.correlationId, { eventId: evt.eventId });
 * log.info('kesinti oluşturuldu');
 */
export function withCorrelation(
  logger: Logger,
  correlationId: string,
  extra: Record<string, unknown> = {},
): Logger {
  return logger.child({ correlationId, ...extra });
}
