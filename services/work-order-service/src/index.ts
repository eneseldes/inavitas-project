import { createLogger, isDevelopment } from '@inavitas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { disconnectDb } from './db.ts';
import { connectKafka, disconnectKafka, startWorkOrderConsumer } from './kafka.ts';
import { createWorkOrderEventHandler } from './kafka/consumers.ts';

const logger = createLogger({
  service: 'work-order-service',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

const app = createApp(logger);
const server = app.listen(config.WORK_ORDER_SERVICE_PORT, () => {
  logger.info({ port: config.WORK_ORDER_SERVICE_PORT }, 'work-order-service ayakta');
});

// bkz. outage-service/src/index.ts için aynı gerekçe (Kafka'nın geç açılışını bekleme).
await connectKafka();
await startWorkOrderConsumer(createWorkOrderEventHandler(logger), logger);
logger.info('Kafka consumer ayakta (outage.created, outage.linked, outage.energized)');

/** Graceful shutdown — bkz. outage-service/src/index.ts için aynı gerekçe. */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'kapanış başlatıldı');

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'sunucu kapatılamadı');
      process.exit(1);
    }

    await disconnectKafka();
    await disconnectDb();
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
