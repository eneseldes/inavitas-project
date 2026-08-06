import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { TOPICS } from './topics.ts';

/** Kesinti durumları. DB enum'ı ile birebir aynı olmalı. */
export const OutageStatus = z.enum([
  'STARTED', // kayıt açıldı, kesinti sürüyor
  'ENERGIZED', // enerji verildi
  'ARCHIVED', // kayıt kapatıldı / arşivlendi
  'CANCELLED', // hatalı kayıt / iptal — her durumdan buraya geçilebilir
]);
export type OutageStatus = z.infer<typeof OutageStatus>;

/** Coğrafi kimlik — kesintiye sebep olan kesicinin (circuit breaker) id'si. */
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
 * Kesintiye iş emri bağlandı.
 *
 * Bu event BİLEREK 'outage.created'dan ayrı: consumer'ı yalnızca bir UPDATE
 * yapar, asla yeni kayıt açmaz. Böylece döngü sadece origin bayrağıyla değil,
 * topolojik olarak da imkânsız hale gelir.
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
