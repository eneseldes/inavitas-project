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

/** Coğrafi ekipman/şebeke kimliği (GIS ID). */
export const GisId = z.string().min(1).max(64);

export const OutageCreatedPayload = z.object({
  outageId: z.uuid(),
  gisId: GisId,
  startedAt: z.iso.datetime(),
  status: OutageStatus,
  workOrderId: z.uuid().nullable(),
});
export type OutageCreatedPayload = z.infer<typeof OutageCreatedPayload>;

export const OutageEnergizedPayload = z.object({
  outageId: z.uuid(),
  gisId: GisId,
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

export const OutageCreatedEvent = envelopeOf(TOPICS.OUTAGE_CREATED, OutageCreatedPayload);
export type OutageCreatedEvent = z.infer<typeof OutageCreatedEvent>;

export const OutageEnergizedEvent = envelopeOf(TOPICS.OUTAGE_ENERGIZED, OutageEnergizedPayload);
export type OutageEnergizedEvent = z.infer<typeof OutageEnergizedEvent>;

export const OutageLinkedEvent = envelopeOf(TOPICS.OUTAGE_LINKED, OutageLinkedPayload);
export type OutageLinkedEvent = z.infer<typeof OutageLinkedEvent>;
