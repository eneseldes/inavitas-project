import { createLogger, isDevelopment } from '@edas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { disconnectDb } from './db.ts';

const logger = createLogger({
  service: 'access-service',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

const app = createApp(logger);
const server = app.listen(config.ACCESS_SERVICE_PORT, () => {
  logger.info({ port: config.ACCESS_SERVICE_PORT }, 'access-service ayakta');
});

/**
 * Graceful shutdown.
 *
 * Ctrl+C'de süreci anında öldürmek, işlenmekte olan istekleri yarıda keser
 * ve DB bağlantılarını asılı bırakır. Önce yeni bağlantı kabulünü durdur,
 * açık istekleri bitir, sonra kapan.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'kapanış başlatıldı');

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'sunucu kapatılamadı');
      process.exit(1);
    }

    await disconnectDb();
    logger.info('kapanış tamam');
    process.exit(0);
  });

  // Askıda kalan bir istek yüzünden sonsuza kadar beklemeyelim.
  setTimeout(() => {
    logger.error('kapanış zaman aşımına uğradı, zorla çıkılıyor');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
