import { z } from 'zod';

/**
 * Kaydın kaynağı:
 * - USER: Kullanıcı tarafından doğrudan oluşturuldu.
 * - SYSTEM: Karşı servisteki event sonucu otomatik olarak sistemce oluşturuldu.
 * 
 * Sistem kaynaklı kayıtlar tekrar otomatik event tetiklemez (sonsuz döngü koruması).
 */
export const RecordOrigin = z.enum(['USER', 'SYSTEM']);
export type RecordOrigin = z.infer<typeof RecordOrigin>;

/** Otomatik sistem işlemlerinde aktör kimliği. */
export const SYSTEM_ACTOR = 'SYSTEM';

/** Event zincirlerinin maksimum derinlik sınırı (döngü ve derin zincir koruması). */
export const MAX_EVENT_DEPTH = 3;

/** Tüm event'lerin ortak zarf (envelope) veri yapısı. */
export const EventEnvelopeShape = {
  /** Idempotency takibi için benzersiz event kimliği. */
  eventId: z.uuid(),
  /** Event tipi adı (ör. 'outage.created'). */
  eventType: z.string().min(1),
  /** Şema versiyon numarası. */
  eventVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
  /** Uçtan uca izlenebilirlik (tracing) için istek/oturum kimliği. */
  correlationId: z.string().min(1),
  /** Bu event'i tetikleyen kök event'in id'si. */
  causationId: z.uuid().optional(),
  /** Kaynak türü (USER / SYSTEM). */
  origin: RecordOrigin,
  /** İşlemi yapan kullanıcı kimliği veya 'SYSTEM'. */
  actor: z.string().min(1),
  /** Event zincirindeki derinlik seviyesi. */
  depth: z.number().int().min(0),
} as const;

/** Henüz ayrıştırılmamış ham event zarfı. */
export const RawEventEnvelope = z.object({
  ...EventEnvelopeShape,
  payload: z.unknown(),
});
export type RawEventEnvelope = z.infer<typeof RawEventEnvelope>;

/** Belirli bir payload tipine sahip tipli event zarfı şeması üretir. */
export function envelopeOf<TType extends string, TPayload extends z.ZodTypeAny>(
  eventType: TType,
  payload: TPayload,
) {
  return z.object({
    ...EventEnvelopeShape,
    eventType: z.literal(eventType),
    payload,
  });
}

/** Yeni bir event zarfı oluşturmak için gerekli parametreler. */
export interface CreateEnvelopeInput<TType extends string, TPayload> {
  eventType: TType;
  payload: TPayload;
  origin: RecordOrigin;
  actor: string;
  correlationId: string;
  /** Bu event başka bir event tarafından tetiklendiyse ilgili kök event bilgisi. */
  causedBy?: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

/**
 * Benzersiz id, zaman damgası ve derinlik değerlerini otomatik atayarak event zarfı üretir.
 */
export function createEnvelope<TType extends string, TPayload>(
  input: CreateEnvelopeInput<TType, TPayload>,
) {
  return {
    eventId: globalThis.crypto.randomUUID(),
    eventType: input.eventType,
    eventVersion: 1 as const,
    occurredAt: new Date().toISOString(),
    correlationId: input.correlationId,
    causationId: input.causedBy?.eventId,
    origin: input.origin,
    actor: input.actor,
    depth: input.causedBy ? input.causedBy.depth + 1 : 0,
    payload: input.payload,
  };
}

/**
 * Gelen event'in otomatik karşı kayıt tetikleyip tetiklemeyeceğini denetler.
 * Yalnızca kullanıcı kaynaklı (USER) ve derinlik sınırını aşmayan event'ler tetikleme yapar.
 */
export function shouldTriggerCounterpart(envelope: Pick<RawEventEnvelope, 'origin' | 'depth'>): boolean {
  return envelope.origin === 'USER' && envelope.depth < MAX_EVENT_DEPTH;
}

