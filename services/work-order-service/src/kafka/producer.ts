import {
  createEnvelope,
  TOPICS,
  type RawEventEnvelope,
  type WorkOrderCancelledPayload,
  type WorkOrderCreatedPayload,
  type WorkOrderDonePayload,
} from '@inavitas/contracts';
import type { Tx } from '../db.ts';
import { enqueueTx } from '../repository/outbox.repository.ts';
import type { WorkOrderRow } from '../repository/work-order.repository.ts';

export interface PublishOptions {
  origin: 'USER' | 'SYSTEM';
  actor: string;
  correlationId: string;
  causedBy?: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

/**
 * Yeni iş emri oluşturulduğunda 'work-order.created' olayını outbox tablosuna yazar.
 *
 * `origin` **çağırandan gelir, sabit yazılmaz.** Sabit `'USER'` yazmak
 * `shouldTriggerCounterpart` kontrolünü yanıltır: consumer kaynaklı bir kayıt `USER` görünür,
 * karşı servis de ona bir karşılık üretir ve iki servis birbirini sonsuza kadar tetikler.
 */
export async function enqueueWorkOrderCreatedTx(tx: Tx, row: WorkOrderRow, opts: PublishOptions): Promise<void> {
  const payload: WorkOrderCreatedPayload = {
    workOrderId: row.id,
    cbsId: row.cbsId,
    type: row.type,
    status: row.status,
    outageId: row.outageId,
  };

  const envelope = createEnvelope({
    eventType: TOPICS.WORK_ORDER_CREATED,
    payload,
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  await enqueueTx(tx, TOPICS.WORK_ORDER_CREATED, row.cbsId, envelope);
}

/**
 * İş emri DONE durumuna geldiğinde 'work-order.done' event'ini outbox'a yazar.
 * `origin` için bkz. {@link enqueueWorkOrderCreatedTx}.
 */
export async function enqueueWorkOrderDoneTx(tx: Tx, row: WorkOrderRow, opts: PublishOptions): Promise<void> {
  const payload: WorkOrderDonePayload = {
    workOrderId: row.id,
    cbsId: row.cbsId,
    type: row.type,
    doneAt: row.updatedAt.toISOString(),
    outageId: row.outageId,
  };

  const envelope = createEnvelope({
    eventType: TOPICS.WORK_ORDER_DONE,
    payload,
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  await enqueueTx(tx, TOPICS.WORK_ORDER_DONE, row.cbsId, envelope);
}

/**
 * İş emri iptal edildiğinde 'work-order.cancelled' olayını outbox'a yazar.
 *
 * `outage.cancelled` ile simetriktir: bağlı kesinti bu olayla iptal edilir. Olay **her
 * hâlükârda** yayınlanır; döngü koruması tüketimde `shouldTriggerCounterpart` ile yapılır.
 */
export async function enqueueWorkOrderCancelledIfNeededTx(
  tx: Tx,
  previousStatus: string,
  row: WorkOrderRow,
  opts: PublishOptions,
): Promise<void> {
  if (previousStatus === 'CANCELLED' || row.status !== 'CANCELLED') return;

  const payload: WorkOrderCancelledPayload = {
    workOrderId: row.id,
    cbsId: row.cbsId,
    cancelledAt: row.updatedAt.toISOString(),
    outageId: row.outageId,
  };

  const envelope = createEnvelope({
    eventType: TOPICS.WORK_ORDER_CANCELLED,
    payload,
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  await enqueueTx(tx, TOPICS.WORK_ORDER_CANCELLED, row.cbsId, envelope);
}

/** İş emrine bir kesinti bağlandığında 'work-order.linked' event'ini outbox'a yazar. */
export async function enqueueWorkOrderLinkedTx(
  tx: Tx,
  workOrderId: string,
  cbsId: string,
  outageId: string,
  opts: PublishOptions,
): Promise<void> {
  const envelope = createEnvelope({
    eventType: TOPICS.WORK_ORDER_LINKED,
    payload: { workOrderId, outageId },
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  await enqueueTx(tx, TOPICS.WORK_ORDER_LINKED, cbsId, envelope);
}
