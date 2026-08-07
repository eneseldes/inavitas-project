import { createLogger, isDevelopment } from '@inavitas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { disconnectDb } from './db.ts';
import { connectKafka, disconnectKafka, startOutageConsumer } from './kafka.ts';
import { createOutageEventHandler } from './kafka/consumers.ts';

const logger = createLogger({
  service: 'outage-service',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

const app = createApp(logger);
const server = app.listen(config.OUTAGE_SERVICE_PORT, () => {
  logger.info({ port: config.OUTAGE_SERVICE_PORT }, 'outage-service ayakta');
});

// Kafka bağlantısı HTTP sunucusundan bağımsız kurulur: `retry.retries: 10`
// sayesinde Kafka henüz hazır değilse (~15-30 sn JVM açılışı) burada bekler,
// servisi çökertmez (roadmap Faz 4 tuzağı).
await connectKafka();
await startOutageConsumer(createOutageEventHandler(logger), logger);
logger.info('Kafka consumer ayakta (work-order.created, work-order.linked, work-order.done)');

/**
 * Graceful shutdown — bkz. access-service/src/index.ts için aynı gerekçe.
 * Kafka'yı DB'den önce kapatıyoruz: consumer işlediği son mesajı bitirene
 * kadar DB bağlantısına ihtiyacı var; sırayı tersine çevirirsen yarım
 * işlenmiş bir mesaj DB bağlantısı koptuktan sonra hataya düşer.
 */
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
