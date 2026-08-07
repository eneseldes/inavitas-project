import {
  parseEvent,
  shouldTriggerCounterpart,
  SYSTEM_ACTOR,
  TOPICS,
  type OutageCreatedEvent,
  type OutageEnergizedEvent,
  type OutageLinkedEvent,
} from '@inavitas/contracts';
import { ValidationError, withCorrelation, type EventHandler, type Logger } from '@inavitas/shared';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from '../db.ts';
import { workOrders } from '../db/schema.ts';
import { canTransition } from '../domain/state-machine.ts';
import { markProcessed } from '../repository/idempotency.repository.ts';
import { createTx, linkOutageTx, updateWithVersionTx } from '../repository/work-order.repository.ts';
import { publishWorkOrderLinked } from './producer.ts';

/**
 * `outage.created` — FR-4.2: kullanıcı kaynaklı bir kesinti açıldığında,
 * aynı `gisId` için `origin=SYSTEM`, `type=UNPLANNED_OUTAGE_WORK_ORDER` bir
 * iş emri oluşur. Sıralama outage-service'teki handleWorkOrderCreated ile
 * simetrik (bkz. orada aynı gerekçe).
 */
export async function handleOutageCreated(envelope: OutageCreatedEvent, log: Logger): Promise<void> {
  if (!shouldTriggerCounterpart(envelope)) {
    log.debug({ eventId: envelope.eventId }, 'sistem kaynaklı/derinlik aşıldı, atlanıyor');
    return;
  }
  if (envelope.payload.workOrderId) {
    log.debug({ eventId: envelope.eventId }, 'kesinti zaten bir iş emrine bağlı, atlanıyor');
    return;
  }

  const created = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.OUTAGE_CREATED);
    if (!processed) return null;

    return createTx(
      tx,
      {
        gisId: envelope.payload.gisId,
        type: 'UNPLANNED_OUTAGE_WORK_ORDER',
        status: 'STARTED',
        origin: 'SYSTEM',
        createdBy: SYSTEM_ACTOR,
        outageId: envelope.payload.outageId,
      },
      envelope.correlationId,
    );
  });

  if (!created) {
    log.debug({ eventId: envelope.eventId }, 'event zaten işlenmiş, atlanıyor');
    return;
  }

  log.info(
    { workOrderId: created.id, outageId: envelope.payload.outageId, gisId: created.gisId },
    'kesintiden otomatik iş emri oluşturuldu',
  );

  await publishWorkOrderLinked(
    created.id,
    created.gisId,
    envelope.payload.outageId,
    { origin: 'SYSTEM', actor: SYSTEM_ACTOR, correlationId: envelope.correlationId, causedBy: envelope },
    log,
  );
}

/** `outage.linked` — SADECE UPDATE yapar, yeni event yayınlamaz (Savunma 2). */
export async function handleOutageLinked(envelope: OutageLinkedEvent, log: Logger): Promise<void> {
  const updated = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.OUTAGE_LINKED);
    if (!processed) return null;

    return linkOutageTx(tx, envelope.payload.workOrderId, envelope.payload.outageId);
  });

  if (!updated) {
    log.debug({ eventId: envelope.eventId }, 'zaten işlenmiş veya iş emri bulunamadı, atlanıyor');
    return;
  }

  log.info({ workOrderId: updated.id, outageId: envelope.payload.outageId }, 'iş emri kesintiye bağlandı');
}

/**
 * `outage.energized` — "kesinti giderildi" ile "iş emri ENERGIZED" aynı
 * fiziksel milestone (enerji geri geldi); bağlı iş emri bu durumu
 * yakalayabiliyorsa (canTransition) ileri taşınır. Yalnızca UPDATE yapar,
 * yeni event yayınlamaz — `work-order.done` ayrı, kullanıcının/ekibin
 * kapanış işlemini tamamladığını bildiren, bilinçli bir sonraki adımdır.
 */
export async function handleOutageEnergized(envelope: OutageEnergizedEvent, log: Logger): Promise<void> {
  if (!envelope.payload.workOrderId) {
    log.debug({ eventId: envelope.eventId }, 'kesinti bir iş emrine bağlı değil, atlanıyor');
    return;
  }

  const result = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.OUTAGE_ENERGIZED);
    if (!processed) return null;

    const [current] = await tx.select().from(workOrders).where(eq(workOrders.id, envelope.payload.workOrderId!));
    if (!current) {
      log.warn({ workOrderId: envelope.payload.workOrderId }, 'bağlı iş emri bulunamadı');
      return null;
    }

    if (!canTransition(current.status, 'ENERGIZED')) {
      return { previousStatus: current.status, row: current };
    }

    const updated = await updateWithVersionTx(
      tx,
      current.id,
      current.version,
      { status: 'ENERGIZED' },
      { fromStatus: current.status, actor: SYSTEM_ACTOR, origin: 'SYSTEM', correlationId: envelope.correlationId },
    );

    return updated ? { previousStatus: current.status, row: updated } : null;
  });

  if (!result) {
    log.debug({ eventId: envelope.eventId }, 'zaten işlenmiş veya version çakışması, atlanıyor');
    return;
  }

  if (result.previousStatus === result.row.status) {
    log.debug({ workOrderId: result.row.id, status: result.row.status }, 'iş emri bu geçişi kabul etmiyor, atlanıyor');
    return;
  }

  log.info({ workOrderId: result.row.id }, 'kesinti enerjilendi, bağlı iş emri otomatik ENERGIZED yapıldı');
}

const VALIDATORS = {
  [TOPICS.OUTAGE_CREATED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_CREATED, raw),
  [TOPICS.OUTAGE_LINKED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_LINKED, raw),
  [TOPICS.OUTAGE_ENERGIZED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_ENERGIZED, raw),
} as const;

/** bkz. outage-service/src/kafka/consumers.ts createOutageEventHandler için aynı gerekçe. */
export function createWorkOrderEventHandler(logger: Logger): EventHandler {
  return async (topic, message) => {
    const validate = VALIDATORS[topic as keyof typeof VALIDATORS];
    if (!validate) {
      logger.warn({ topic }, 'bilinmeyen topic, atlanıyor');
      return;
    }

    let envelope: ReturnType<typeof validate>;
    try {
      envelope = validate(message);
    } catch (err) {
      const details = err instanceof ZodError ? err.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })) : undefined;
      throw new ValidationError('Kafka event şeması geçersiz', details);
    }

    const log = withCorrelation(logger, envelope.correlationId, { eventId: envelope.eventId, eventType: envelope.eventType });

    switch (topic) {
      case TOPICS.OUTAGE_CREATED:
        return handleOutageCreated(envelope as OutageCreatedEvent, log);
      case TOPICS.OUTAGE_LINKED:
        return handleOutageLinked(envelope as OutageLinkedEvent, log);
      case TOPICS.OUTAGE_ENERGIZED:
        return handleOutageEnergized(envelope as OutageEnergizedEvent, log);
    }
  };
}
