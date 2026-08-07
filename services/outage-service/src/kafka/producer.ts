import {
  createEnvelope,
  TOPICS,
  type OutageCreatedPayload,
  type OutageEnergizedPayload,
  type RawEventEnvelope,
} from '@inavitas/contracts';
import type { Logger } from '@inavitas/shared';
import { getProducer } from '../kafka.ts';
import type { OutageRow } from '../repository/outage.repository.ts';

/**
 * `POST /outages` sonrası çağrılır — SADECE kullanıcı kaynaklı kayıtlar için.
 * Sistem kaynaklı (origin=SYSTEM) kayıtlar bu event'i DEĞİL, `outage.linked`i
 * yayınlar (bkz. kafka/consumers.ts handleWorkOrderCreated) — aksi halde
 * work-order-service bu kaydı da "kullanıcı oluşturdu" sanıp yeni bir iş
 * emri daha açar (sonsuz döngü).
 *
 * Publish, DB commit'inden SONRA ve isteğin cevabından ÖNCE, `await` ile
 * yapılır ama hata durumunda isteği düşürmeyiz — kayıt zaten DB'de, 201
 * dönmek doğru olan; publish başarısızlığı loglanır ve "şimdilik bilinen bir
 * risk" olarak kabul edilir (outbox pattern Faz 6'da bu boşluğu kapatır).
 */
export async function publishOutageCreated(row: OutageRow, correlationId: string, actor: string, log: Logger): Promise<void> {
  const payload: OutageCreatedPayload = {
    outageId: row.id,
    gisId: row.gisId,
    startedAt: row.startedAt.toISOString(),
    status: row.status,
    workOrderId: row.workOrderId,
  };

  const envelope = createEnvelope({
    eventType: TOPICS.OUTAGE_CREATED,
    payload,
    origin: 'USER',
    actor,
    correlationId,
  });

  try {
    await getProducer().publish(TOPICS.OUTAGE_CREATED, row.gisId, envelope);
  } catch (err) {
    log.error({ err, outageId: row.id }, 'outage.created yayınlanamadı');
  }
}

export interface PublishOptions {
  origin: 'USER' | 'SYSTEM';
  actor: string;
  correlationId: string;
  causedBy?: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

/**
 * Bir kesinti ENERGIZED durumuna YENİ geçtiyse `outage.energized` yayınlar
 * (durum zaten ENERGIZED'sa hiçbir şey yapmaz — controller.patch() ve
 * work-order.done consumer'ı ikisi de bunu çağırır, tekrar yayın önlenir).
 */
export async function publishOutageEnergizedIfNeeded(
  previousStatus: string,
  row: OutageRow,
  opts: PublishOptions,
  log: Logger,
): Promise<void> {
  if (previousStatus === 'ENERGIZED' || row.status !== 'ENERGIZED' || !row.endedAt) return;

  const payload: OutageEnergizedPayload = {
    outageId: row.id,
    gisId: row.gisId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
    workOrderId: row.workOrderId,
  };

  const envelope = createEnvelope({
    eventType: TOPICS.OUTAGE_ENERGIZED,
    payload,
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  try {
    await getProducer().publish(TOPICS.OUTAGE_ENERGIZED, row.gisId, envelope);
  } catch (err) {
    log.error({ err, outageId: row.id }, 'outage.energized yayınlanamadı');
  }
}

/** `work-order.created` consumer'ının geri bağlama event'i — bkz. kafka/consumers.ts. */
export async function publishOutageLinked(
  outageId: string,
  gisId: string,
  workOrderId: string,
  opts: PublishOptions,
  log: Logger,
): Promise<void> {
  const envelope = createEnvelope({
    eventType: TOPICS.OUTAGE_LINKED,
    payload: { outageId, workOrderId },
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  try {
    await getProducer().publish(TOPICS.OUTAGE_LINKED, gisId, envelope);
  } catch (err) {
    log.error({ err, outageId, workOrderId }, 'outage.linked yayınlanamadı');
  }
}
