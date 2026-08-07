import {
  parseEvent,
  shouldTriggerCounterpart,
  SYSTEM_ACTOR,
  TOPICS,
  type WorkOrderCreatedEvent,
  type WorkOrderDoneEvent,
  type WorkOrderLinkedEvent,
} from '@inavitas/contracts';
import { ValidationError, withCorrelation, type EventHandler, type Logger } from '@inavitas/shared';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from '../db.ts';
import { outages } from '../db/schema.ts';
import { canTransition } from '../domain/state-machine.ts';
import { markProcessed } from '../repository/idempotency.repository.ts';
import { createTx, linkWorkOrderTx, updateWithVersionTx } from '../repository/outage.repository.ts';
import { publishOutageEnergizedIfNeeded, publishOutageLinked } from './producer.ts';

/**
 * 'work-order.created' event'i işleyicisi: Kullanıcı kaynaklı bir iş emri oluştuğunda otomatik sistem kesintisi oluşturur.
 */
export async function handleWorkOrderCreated(envelope: WorkOrderCreatedEvent, log: Logger): Promise<void> {
  if (!shouldTriggerCounterpart(envelope)) {
    log.debug({ eventId: envelope.eventId }, 'sistem kaynaklı/derinlik aşıldı, atlanıyor');
    return;
  }
  if (envelope.payload.outageId) {
    log.debug({ eventId: envelope.eventId }, 'iş emri zaten bir kesintiye bağlı, atlanıyor');
    return;
  }

  const created = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.WORK_ORDER_CREATED);
    if (!processed) return null;

    return createTx(
      tx,
      {
        gisId: envelope.payload.gisId,
        startedAt: new Date(),
        endedAt: null,
        status: 'STARTED',
        origin: 'SYSTEM',
        createdBy: SYSTEM_ACTOR,
        workOrderId: envelope.payload.workOrderId,
      },
      envelope.correlationId,
    );
  });

  if (!created) {
    log.debug({ eventId: envelope.eventId }, 'event zaten işlenmiş, atlanıyor');
    return;
  }

  log.info(
    { outageId: created.id, workOrderId: envelope.payload.workOrderId, gisId: created.gisId },
    'iş emrinden otomatik kesinti oluşturuldu',
  );

  await publishOutageLinked(
    created.id,
    created.gisId,
    envelope.payload.workOrderId,
    { origin: 'SYSTEM', actor: SYSTEM_ACTOR, correlationId: envelope.correlationId, causedBy: envelope },
    log,
  );
}

/**
 * 'work-order.linked' event'i işleyicisi: Kesintiyi ilgili iş emrine bağlar.
 */
export async function handleWorkOrderLinked(envelope: WorkOrderLinkedEvent, log: Logger): Promise<void> {
  const updated = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.WORK_ORDER_LINKED);
    if (!processed) return null;

    return linkWorkOrderTx(tx, envelope.payload.outageId, envelope.payload.workOrderId);
  });

  if (!updated) {
    log.debug({ eventId: envelope.eventId }, 'zaten işlenmiş veya kesinti bulunamadı, atlanıyor');
    return;
  }

  log.info({ outageId: updated.id, workOrderId: envelope.payload.workOrderId }, 'kesinti iş emrine bağlandı');
}

/**
 * 'work-order.done' event'i işleyicisi: Bağlı iş emri tamamlandığında kesintiyi otomatik ENERGIZED yapar.
 */
export async function handleWorkOrderDone(envelope: WorkOrderDoneEvent, log: Logger): Promise<void> {
  if (!envelope.payload.outageId) {
    log.debug({ eventId: envelope.eventId }, 'iş emri bir kesintiye bağlı değil, atlanıyor');
    return;
  }

  const result = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.WORK_ORDER_DONE);
    if (!processed) return null;

    const [current] = await tx.select().from(outages).where(eq(outages.id, envelope.payload.outageId!));
    if (!current) {
      log.warn({ outageId: envelope.payload.outageId }, 'bağlı kesinti bulunamadı');
      return null;
    }

    if (!canTransition(current.status, 'ENERGIZED')) {
      return { previousStatus: current.status, row: current };
    }

    const now = new Date();
    const updated = await updateWithVersionTx(
      tx,
      current.id,
      current.version,
      { status: 'ENERGIZED', endedAt: current.endedAt ?? now },
      { fromStatus: current.status, actor: SYSTEM_ACTOR, origin: 'SYSTEM', correlationId: envelope.correlationId },
    );

    return updated ? { previousStatus: current.status, row: updated } : null;
  });

  if (!result) {
    log.debug({ eventId: envelope.eventId }, 'zaten işlenmiş veya version çakışması, atlanıyor');
    return;
  }

  if (result.previousStatus === result.row.status) {
    log.debug({ outageId: result.row.id, status: result.row.status }, 'kesinti zaten bu durumda, ENERGIZED atlanıyor');
    return;
  }

  log.info({ outageId: result.row.id, workOrderId: envelope.payload.workOrderId }, 'iş emri tamamlandı, kesinti otomatik ENERGIZED yapıldı');

  await publishOutageEnergizedIfNeeded(
    result.previousStatus,
    result.row,
    { origin: 'SYSTEM', actor: SYSTEM_ACTOR, correlationId: envelope.correlationId, causedBy: envelope },
    log,
  );
}

const VALIDATORS = {
  [TOPICS.WORK_ORDER_CREATED]: (raw: unknown) => parseEvent(TOPICS.WORK_ORDER_CREATED, raw),
  [TOPICS.WORK_ORDER_LINKED]: (raw: unknown) => parseEvent(TOPICS.WORK_ORDER_LINKED, raw),
  [TOPICS.WORK_ORDER_DONE]: (raw: unknown) => parseEvent(TOPICS.WORK_ORDER_DONE, raw),
} as const;

/**
 * outage-service Kafka event dinleyici işleyicisi (event handler).
 */
export function createOutageEventHandler(logger: Logger): EventHandler {
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
      case TOPICS.WORK_ORDER_CREATED:
        return handleWorkOrderCreated(envelope as WorkOrderCreatedEvent, log);
      case TOPICS.WORK_ORDER_LINKED:
        return handleWorkOrderLinked(envelope as WorkOrderLinkedEvent, log);
      case TOPICS.WORK_ORDER_DONE:
        return handleWorkOrderDone(envelope as WorkOrderDoneEvent, log);
    }
  };
}
