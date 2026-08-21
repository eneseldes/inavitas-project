import { configureMetrics, createLogger, isDevelopment } from '@inavitas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { disconnectDb } from './db.ts';
import { connectKafka, disconnectKafka, startWorkOrderConsumer } from './kafka.ts';
import { createWorkOrderEventHandler } from './kafka/consumers.ts';
import { startOutboxPoller, type OutboxPollerHandle } from './kafka/outbox-poller.ts';
import { disconnectRedis } from './redis.ts';

const logger = await createLogger({
  service: 'work-order-service',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

// Tüm metrik serileri servis adıyla etiketlenir; Prometheus'un `job` etiketi kazıma
// yapılandırmasından gelir ve sorgu yazarken ikisinin aynı olduğuna güvenilmemeli.
configureMetrics({ service: 'work-order-service' });

const app = createApp(logger);
const server = app.listen(config.WORK_ORDER_SERVICE_PORT, () => {
  logger.info({ port: config.WORK_ORDER_SERVICE_PORT }, 'work-order-service ayakta');
});

await connectKafka();
await startWorkOrderConsumer(createWorkOrderEventHandler(logger), logger);
logger.info('Kafka consumer ayakta (outage.created, outage.linked, outage.energized)');

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
