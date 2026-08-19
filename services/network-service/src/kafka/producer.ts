import {
  createEnvelope,
  TOPICS,
  type OutageImpactCalculatedPayload,
  type RawEventEnvelope,
} from '@inavitas/contracts';
import type { Tx } from '../db.ts';
import { enqueueTx } from '../repository/outbox.repository.ts';

export interface PublishOptions {
  origin: 'USER' | 'SYSTEM';
  actor: string;
  correlationId: string;
  causedBy?: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

/**
 * Etki hesabı tamamlandığında 'outage.impact.calculated' olayını outbox tablosuna yazar.
 * Çağıran, bunu tüketilen olayın idempotency kaydıyla AYNI transaction'da yapmak zorundadır —
 * aksi halde "etki hesaplandı ama olay yayınlanmadı" durumu (dual-write) oluşur.
 */
export async function enqueueOutageImpactCalculatedTx(
  tx: Tx,
  payload: OutageImpactCalculatedPayload,
  opts: PublishOptions,
): Promise<void> {
  const envelope = createEnvelope({
    eventType: TOPICS.OUTAGE_IMPACT_CALCULATED,
    payload,
    origin: opts.origin,
    actor: opts.actor,
    correlationId: opts.correlationId,
    causedBy: opts.causedBy,
  });

  // Bölüm anahtarı CBS ID'dir: aynı elemana ait etki olayları hep aynı partition'a düşer,
  // böylece etki revizyonları sıralı tüketilir.
  await enqueueTx(tx, TOPICS.OUTAGE_IMPACT_CALCULATED, payload.cbsId, envelope);
}
