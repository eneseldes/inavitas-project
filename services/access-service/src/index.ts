import { createLogger, isDevelopment } from '@inavitas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { disconnectDb } from './db.ts';
import { disconnectRedis } from './redis.ts';

const logger = await createLogger({
  service: 'access-service',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

const app = createApp(logger);
const server = app.listen(config.ACCESS_SERVICE_PORT, () => {
  logger.info({ port: config.ACCESS_SERVICE_PORT }, 'access-service ayakta');
});

let shuttingDown = false;

/** Uygulamayı güvenli bir şekilde kapatır (graceful shutdown). */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'kapanış başlatıldı');

  server.close(async (err) => {
    if (err && (err as { code?: string }).code !== 'ERR_SERVER_NOT_RUNNING') {
      logger.error({ err }, 'sunucu kapatılamadı');
      process.exit(1);
    }

    await disconnectDb();
    await disconnectRedis();
    logger.info('kapanış tamam');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('kapanış zaman aşımına uğradı, zorla çıkılıyor');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
