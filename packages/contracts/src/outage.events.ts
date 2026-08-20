import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { TOPICS } from './topics.ts';

/** Kesinti durumları. */
export const OutageStatus = z.enum([
  'STARTED', // Kesinti başlatıldı/sürüyor
  'ENERGIZED', // Enerji verildi
  'ARCHIVED', // Arşivlendi / kapatıldı
  'CANCELLED', // İptal edildi
]);
export type OutageStatus = z.infer<typeof OutageStatus>;

/**
 * CBS (coğrafi bilgi sistemi) eleman kimliği — `network.components.id` ile birebir aynı
 * kimlik uzayıdır. Eskiden `gisId` adıyla serbest metindi; artık var olan bir şebeke
 * elemanına işaret etmek zorundadır (bkz. `network_components_ro` read-model'i).
 */
export const CbsId = z.string().min(1).max(64);

export const OutageCreatedPayload = z.object({
  outageId: z.uuid(),
  cbsId: CbsId,
  startedAt: z.iso.datetime(),
  status: OutageStatus,
  workOrderId: z.uuid().nullable(),
});
export type OutageCreatedPayload = z.infer<typeof OutageCreatedPayload>;

export const OutageEnergizedPayload = z.object({
  outageId: z.uuid(),
  cbsId: CbsId,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  workOrderId: z.uuid().nullable(),
});
export type OutageEnergizedPayload = z.infer<typeof OutageEnergizedPayload>;

/**
 * Kesintiye var olan bir iş emri bağlandığında yayınlanan event payload'ı.
 * Tüketici servisler bu event ile yeni kayıt açmaz, yalnızca mevcut kesintiyi günceller.
 */
export const OutageLinkedPayload = z.object({
  outageId: z.uuid(),
  workOrderId: z.uuid(),
});
export type OutageLinkedPayload = z.infer<typeof OutageLinkedPayload>;

/**
 * Kesinti iptal edildiğinde yayınlanır.
 *
 * Kesinti nasıl iptal edilirse edilsin bu olay **her hâlükârda** yayınlanır:
 * `network-service`'in şebekeyi yeniden enerjilendirmesi yalnız buna bağlıdır. Sonsuz döngü
 * koruması olayı yayınlamamakla değil, tüketirken `shouldTriggerCounterpart` ile yapılır.
 */
export const OutageCancelledPayload = z.object({
  outageId: z.uuid(),
  cbsId: CbsId,
  cancelledAt: z.iso.datetime(),
  workOrderId: z.uuid().nullable(),
});
export type OutageCancelledPayload = z.infer<typeof OutageCancelledPayload>;

/** Kesintiler arası kaskad ilişki türleri. */
export const OutageRelationType = z.enum([
  'CONTAINS', // Üstteki kesinti alttakini kapsar — müşteri-dakika yalnız üstte sayılır
  'SUPERSEDES', // Etki büyüdü, kesinti üst elemana taşındı
]);
export type OutageRelationType = z.infer<typeof OutageRelationType>;

/**
 * Kaskad ilişkisi kurulduğunda yayınlanır. Yalnız bildirim amaçlıdır — ilişkiyi yazan
 * `outage-service`'in kendisidir, tüketici bu olayla kayıt açmaz.
 */
export const OutageCascadedPayload = z.object({
  parentOutageId: z.uuid(),
  childOutageId: z.uuid(),
  relationType: OutageRelationType,
});
export type OutageCascadedPayload = z.infer<typeof OutageCascadedPayload>;

export const OutageCreatedEvent = envelopeOf(TOPICS.OUTAGE_CREATED, OutageCreatedPayload);
export type OutageCreatedEvent = z.infer<typeof OutageCreatedEvent>;

export const OutageEnergizedEvent = envelopeOf(TOPICS.OUTAGE_ENERGIZED, OutageEnergizedPayload);
export type OutageEnergizedEvent = z.infer<typeof OutageEnergizedEvent>;

export const OutageLinkedEvent = envelopeOf(TOPICS.OUTAGE_LINKED, OutageLinkedPayload);
export type OutageLinkedEvent = z.infer<typeof OutageLinkedEvent>;

export const OutageCancelledEvent = envelopeOf(TOPICS.OUTAGE_CANCELLED, OutageCancelledPayload);
export type OutageCancelledEvent = z.infer<typeof OutageCancelledEvent>;

export const OutageCascadedEvent = envelopeOf(TOPICS.OUTAGE_CASCADED, OutageCascadedPayload);
export type OutageCascadedEvent = z.infer<typeof OutageCascadedEvent>;
