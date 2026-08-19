import {
  createEnvelope,
  SYSTEM_ACTOR,
  TOPICS,
  type OutageCascadedPayload,
  type OutageCreatedPayload,
  type OutageEnergizedPayload,
  type OutageRelationType,
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
 *
 * ⚠️ **Kesinti nasıl doğarsa doğsun bu olay yayınlanmak zorundadır.** Etki hesabı
 * (`network-service` → `outage.impact.calculated`) yalnız bu olayla tetiklenir; iş emrinden
 * otomatik doğan sistem kesintisi için atlanırsa o kesintinin etkilenen abone kümesi
 * sonsuza kadar `PENDING` kalır.
 *
 * `origin` çağırandan gelir: kullanıcının açtığı kesinti `USER`, iş emrinden doğan
 * `SYSTEM`'dir. Sabit `USER` yazmak, `shouldTriggerCounterpart` kontrolünü yanıltıp
 * kesinti ↔ iş emri arasında sonsuz karşılıklı üretim başlatır.
 */
export async function enqueueOutageCreatedTx(tx: Tx, row: OutageRow, opts: PublishOptions): Promise<void> {
  const payload: OutageCreatedPayload = {
    outageId: row.id,
    cbsId: row.cbsId,
    startedAt: row.startedAt.toISOString(),
    status: row.status,
    workOrderId: row.workOrderId,
  };

  const envelope = createEnvelope({
    eventType: TOPICS.OUTAGE_CREATED,
    payload,
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  await enqueueTx(tx, TOPICS.OUTAGE_CREATED, row.cbsId, envelope);
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
    cbsId: row.cbsId,
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

  await enqueueTx(tx, TOPICS.OUTAGE_ENERGIZED, row.cbsId, envelope);
}

/** Kesintiye bir iş emri bağlandığında 'outage.linked' event'ini outbox'a yazar. */
export async function enqueueOutageLinkedTx(
  tx: Tx,
  outageId: string,
  cbsId: string,
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

  await enqueueTx(tx, TOPICS.OUTAGE_LINKED, cbsId, envelope);
}

/**
 * Kaskad ilişkisi kurulduğunda 'outage.cascaded' olayını outbox'a yazar. İlişkiyi yazan
 * transaction'la aynı transaction'da çağrılmalıdır.
 */
export async function enqueueOutageCascadedTx(
  tx: Tx,
  parentOutageId: string,
  childOutageId: string,
  relationType: OutageRelationType,
  opts: Omit<PublishOptions, 'origin' | 'actor'> & Partial<Pick<PublishOptions, 'origin' | 'actor'>>,
): Promise<void> {
  const payload: OutageCascadedPayload = { parentOutageId, childOutageId, relationType };

  const envelope = createEnvelope({
    eventType: TOPICS.OUTAGE_CASCADED,
    payload,
    origin: opts.origin ?? 'SYSTEM',
    actor: opts.actor ?? SYSTEM_ACTOR,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  await enqueueTx(tx, TOPICS.OUTAGE_CASCADED, parentOutageId, envelope);
}
