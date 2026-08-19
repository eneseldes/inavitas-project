import { createLogger, isDevelopment } from '@inavitas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { disconnectDb } from './db.ts';
import { connectKafka, disconnectKafka, startOutageConsumer } from './kafka.ts';
import { createOutageEventHandler } from './kafka/consumers.ts';
import { startOutboxPoller, type OutboxPollerHandle } from './kafka/outbox-poller.ts';
import { disconnectRedis } from './redis.ts';

const logger = await createLogger({
  service: 'outage-service',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

const app = createApp(logger);
const server = app.listen(config.OUTAGE_SERVICE_PORT, () => {
  logger.info({ port: config.OUTAGE_SERVICE_PORT }, 'outage-service ayakta');
});

await connectKafka();
await startOutageConsumer(createOutageEventHandler(logger), logger);
logger.info('Kafka consumer ayakta (work-order.*, outage.impact.calculated, outage.energized)');

const outboxPoller: OutboxPollerHandle = startOutboxPoller(logger);

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

    outboxPoller.stop();
    await disconnectKafka();
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
