import {
  createEnvelope,
  TOPICS,
  type RawEventEnvelope,
  type WorkOrderCreatedPayload,
  type WorkOrderDonePayload,
} from '@inavitas/contracts';
import type { Logger } from '@inavitas/shared';
import { getProducer } from '../kafka.ts';
import type { WorkOrderRow } from '../repository/work-order.repository.ts';

export interface PublishOptions {
  origin: 'USER' | 'SYSTEM';
  actor: string;
  correlationId: string;
  causedBy?: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

/** Kullanıcı tarafından yeni iş emri oluşturulduğunda 'work-order.created' event'ini yayınlar. */
export async function publishWorkOrderCreated(row: WorkOrderRow, correlationId: string, actor: string, log: Logger): Promise<void> {
  const payload: WorkOrderCreatedPayload = {
    workOrderId: row.id,
    gisId: row.gisId,
    type: row.type,
    status: row.status,
    outageId: row.outageId,
  };

  const envelope = createEnvelope({
    eventType: TOPICS.WORK_ORDER_CREATED,
    payload,
    origin: 'USER',
    actor,
    correlationId,
  });

  try {
    await getProducer().publish(TOPICS.WORK_ORDER_CREATED, row.gisId, envelope);
  } catch (err) {
    log.error({ err, workOrderId: row.id }, 'work-order.created yayınlanamadı');
  }
}

/** İş emri DONE durumuna geldiğinde 'work-order.done' event'ini yayınlar. */
export async function publishWorkOrderDone(row: WorkOrderRow, correlationId: string, actor: string, log: Logger): Promise<void> {
  const payload: WorkOrderDonePayload = {
    workOrderId: row.id,
    gisId: row.gisId,
    type: row.type,
    doneAt: row.updatedAt.toISOString(),
    outageId: row.outageId,
  };

  const envelope = createEnvelope({
    eventType: TOPICS.WORK_ORDER_DONE,
    payload,
    origin: 'USER',
    actor,
    correlationId,
  });

  try {
    await getProducer().publish(TOPICS.WORK_ORDER_DONE, row.gisId, envelope);
  } catch (err) {
    log.error({ err, workOrderId: row.id }, 'work-order.done yayınlanamadı');
  }
}

/** İş emrine bir kesinti bağlandığında 'work-order.linked' event'ini yayınlar. */
export async function publishWorkOrderLinked(
  workOrderId: string,
  gisId: string,
  outageId: string,
  opts: PublishOptions,
  log: Logger,
): Promise<void> {
  const envelope = createEnvelope({
    eventType: TOPICS.WORK_ORDER_LINKED,
    payload: { workOrderId, outageId },
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  try {
    await getProducer().publish(TOPICS.WORK_ORDER_LINKED, gisId, envelope);
  } catch (err) {
    log.error({ err, workOrderId, outageId }, 'work-order.linked yayınlanamadı');
  }
}
