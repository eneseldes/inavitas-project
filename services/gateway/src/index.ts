import { createLogger, isDevelopment } from '@edas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';

const logger = createLogger({
  service: 'gateway',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

const app = createApp(logger);
const server = app.listen(config.GATEWAY_PORT, () => {
  logger.info({ port: config.GATEWAY_PORT }, 'gateway ayakta');
});

/** Graceful shutdown — bkz. access-service/src/index.ts için aynı gerekçe. DB yok, kapatılacak tek şey server. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'kapanış başlatıldı');

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'sunucu kapatılamadı');
      process.exit(1);
    }
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
