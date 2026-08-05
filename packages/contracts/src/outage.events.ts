import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { TOPICS } from './topics.ts';

/** Kesinti durumları. DB enum'ı ile birebir aynı olmalı. */
export const OutageStatus = z.enum([
  'DETECTED', // kayıt açıldı, henüz ekip atanmadı
  'IN_PROGRESS', // ekip sahada
  'RESOLVED', // enerji verildi
  'CANCELLED', // hatalı kayıt / iptal
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

export const OutageResolvedPayload = z.object({
  outageId: z.uuid(),
  gisId: GisId,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  workOrderId: z.uuid().nullable(),
});
export type OutageResolvedPayload = z.infer<typeof OutageResolvedPayload>;

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

export const OutageResolvedEvent = envelopeOf(TOPICS.OUTAGE_RESOLVED, OutageResolvedPayload);
export type OutageResolvedEvent = z.infer<typeof OutageResolvedEvent>;

export const OutageLinkedEvent = envelopeOf(TOPICS.OUTAGE_LINKED, OutageLinkedPayload);
export type OutageLinkedEvent = z.infer<typeof OutageLinkedEvent>;
