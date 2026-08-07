import {
  createEnvelope,
  TOPICS,
  type OutageCreatedPayload,
  type OutageEnergizedPayload,
  type RawEventEnvelope,
} from '@inavitas/contracts';
import type { Tx } from '../db.ts';
import { enqueueTx } from '../repository/outbox.repository.ts';
import type { OutageRow } from '../repository/outage.repository.ts';

export interface PublishOptions {
  origin: 'USER' | 'SYSTEM';
  actor: string;
  correlationId: string;
  causedBy?: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

/**
 * Yeni kesinti oluşturulduğunda 'outage.created' olayını outbox tablosuna yazar.
 */
export async function enqueueOutageCreatedTx(tx: Tx, row: OutageRow, correlationId: string, actor: string): Promise<void> {
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

  await enqueueTx(tx, TOPICS.OUTAGE_CREATED, row.gisId, envelope);
}

/** Kesintiye enerji verildiğinde 'outage.energized' event'ini outbox'a yazar. */
export async function enqueueOutageEnergizedIfNeededTx(
  tx: Tx,
  previousStatus: string,
  row: OutageRow,
  opts: PublishOptions,
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

  await enqueueTx(tx, TOPICS.OUTAGE_ENERGIZED, row.gisId, envelope);
}

/** Kesintiye bir iş emri bağlandığında 'outage.linked' event'ini outbox'a yazar. */
export async function enqueueOutageLinkedTx(
  tx: Tx,
  outageId: string,
  gisId: string,
  workOrderId: string,
  opts: PublishOptions,
): Promise<void> {
  const envelope = createEnvelope({
    eventType: TOPICS.OUTAGE_LINKED,
    payload: { outageId, workOrderId },
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  await enqueueTx(tx, TOPICS.OUTAGE_LINKED, gisId, envelope);
}
