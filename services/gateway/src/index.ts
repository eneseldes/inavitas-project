import { configureMetrics, createLogger, isDevelopment } from '@inavitas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { disconnectRedis } from './redis.ts';

const logger = await createLogger({
  service: 'gateway',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

// Tüm metrik serileri servis adıyla etiketlenir; Prometheus'un `job` etiketi kazıma
// yapılandırmasından gelir ve sorgu yazarken ikisinin aynı olduğuna güvenilmemeli.
configureMetrics({ service: 'gateway' });

const app = createApp(logger);
const server = app.listen(config.GATEWAY_PORT, () => {
  logger.info({ port: config.GATEWAY_PORT }, 'gateway ayakta');
});

let shuttingDown = false;

/** Servisi güvenli bir şekilde kapatır (graceful shutdown). */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'kapanış başlatıldı');

  server.close(async (err) => {
    if (err && (err as { code?: string }).code !== 'ERR_SERVER_NOT_RUNNING') {
      logger.error({ err }, 'sunucu kapatılamadı');
      process.exit(1);
    }
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
