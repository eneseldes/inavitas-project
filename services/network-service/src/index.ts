import { configureMetrics, createLogger, isDevelopment } from '@inavitas/shared';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { disconnectDb } from './db.ts';
import { loadGraph } from './graph/loader.ts';
import { connectKafka, disconnectKafka, startNetworkConsumer } from './kafka.ts';
import { createNetworkEventHandler } from './kafka/consumers.ts';
import { startOutboxPoller, type OutboxPollerHandle } from './kafka/outbox-poller.ts';
import { stopScheduler } from './modules/energization/scheduler.ts';
import { initBaseline, refresh } from './modules/energization/service.ts';
import { disconnectRedis } from './redis.ts';

const logger = await createLogger({
  service: 'network-service',
  level: config.LOG_LEVEL,
  pretty: isDevelopment(config.NODE_ENV),
});

// Tüm metrik serileri servis adıyla etiketlenir; Prometheus'un `job` etiketi kazıma
// yapılandırmasından gelir ve sorgu yazarken ikisinin aynı olduğuna güvenilmemeli.
configureMetrics({ service: 'network-service' });

const app = createApp(logger);
const server = app.listen(config.NETWORK_SERVICE_PORT, () => {
  logger.info({ port: config.NETWORK_SERVICE_PORT }, 'network-service ayakta');
});

await connectKafka();

// Boot sırası bağlayıcıdır:
// loadGraph → computeBaseline → outage_states_ro oku → recompute → consumer'ları başlat
// Graf, tüketiciden ÖNCE yüklenir: `outage.created` işleyicisi ilk mesajda grafı hazır
// bulmalı, aksi halde etki hesabı "graf henüz yüklenmedi" hatasıyla DLQ'ya düşer. Aynı şey
// enerjilenme için de geçerli — ilk `outage.cancelled` mesajı taban çizgisini hazır bulmalı.
await loadGraph(logger);

initBaseline(logger);

// Enerjilenme kalıcı yazılmadığı için restart'ta durum read-model replay'inden kurulur.
await refresh(logger);

await startNetworkConsumer(createNetworkEventHandler(logger), logger);
logger.info('Kafka consumer ayakta (outage.created, outage.energized, outage.cancelled)');

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
    // Planlı kesinti zamanlayıcısı `unref`'li olduğu için çıkışı engellemez; yine de açıkça
    // iptal edilir — kapanış sırasında ateşlenip kapanmış bir havuza sorgu atmasın.
    stopScheduler();
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
