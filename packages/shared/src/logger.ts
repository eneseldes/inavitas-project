import pino, { type Logger } from 'pino';

export type { Logger };

/** Loglarda gizlenmesi (redact edilmesi) gereken hassas alan adları. */
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
  'DEEPL_API_KEY',
  '*.DEEPL_API_KEY',
];

export interface LoggerOptions {
  /** Log çıktılarında yer alacak servis adı. */
  service: string;
  level?: string;
  /** Geliştirme ortamında renkli/okunabilir konsol çıktısı (pino-pretty). */
  pretty?: boolean;
}

/**
 * Servisler için yapılandırılmış Pino logger örneği oluşturur.
 * Konsol ve dosya çıktılarını (multistream) ve hassas veri gizlemeyi (redact) yönetir.
 */
export async function createLogger({ service, level = 'info', pretty = false }: LoggerOptions): Promise<Logger> {
  const fileStream = pino.destination({ dest: `logs/${service}.log`, mkdir: true });

  const consoleStream: pino.DestinationStream | NodeJS.WriteStream = pretty
    ? (await import('pino-pretty')).default({ colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' })
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

/** Benzersiz bir correlationId üretir. */
export function newCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Mevcut logger nesnesine correlationId ve isteğe bağlı ek bağlam verileri ekleyen alt logger türetir.
 */
export function withCorrelation(
  logger: Logger,
  correlationId: string,
  extra: Record<string, unknown> = {},
): Logger {
  return logger.child({ correlationId, ...extra });
}
