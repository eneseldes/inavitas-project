import { z } from 'zod';

/**
 * Bir kaydı kullanıcının mı sistemin mi oluşturduğu.
 *
 * Bu alan projedeki en kritik tek alandır: sonsuz döngü koruması buna dayanır.
 * Consumer'lar yalnızca origin === 'USER' olan event'lerde karşı kayıt yaratır.
 * Sistem kaynaklı kayıtların event'i kimseyi tetiklemez.
 */
export const RecordOrigin = z.enum(['USER', 'SYSTEM']);
export type RecordOrigin = z.infer<typeof RecordOrigin>;

/** Sistem tarafından oluşturulan kayıtların createdBy/actor değeri. */
export const SYSTEM_ACTOR = 'SYSTEM';

/**
 * Bir event zincirinin izin verilen azami derinliği.
 * Döngü korumasının üçüncü katmanı — origin kontrolü bir gün bozulursa
 * sistemi kurtaran güvenlik ağı. Normal akışta derinlik en fazla 1'dir.
 */
export const MAX_EVENT_DEPTH = 3;

/**
 * Tüm event'lerin ortak zarfı. Payload her event tipinde farklı,
 * zarf her zaman aynı.
 */
export const EventEnvelopeShape = {
  /** Idempotency anahtarı. Aynı eventId iki kez işlenmemeli. */
  eventId: z.uuid(),
  /** 'outage.created' gibi. Hangi topic'e ait olduğunu gövdede de taşırız. */
  eventType: z.string().min(1),
  /** Şema evrimi için. Kırıcı değişiklikte 2'ye çıkar, consumer ikisini de anlar. */
  eventVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
  /** Uçtan uca izleme: gateway'den başlar, tüm HTTP ve event zincirinde taşınır. */
  correlationId: z.string().min(1),
  /** Bu event'i doğuran event'in id'si. Zinciri geriye doğru okumayı sağlar. */
  causationId: z.uuid().optional(),
  /** Döngü korumasının kalbi. */
  origin: RecordOrigin,
  /** Kullanıcı id'si veya 'SYSTEM'. */
  actor: z.string().min(1),
  /** Zincir derinliği. Her türetilmiş event bir öncekinin depth + 1'i ile yayınlanır. */
  depth: z.number().int().min(0),
} as const;

/** Payload'ı henüz çözülmemiş, ham zarf. Topic yönlendirmesi için kullanılır. */
export const RawEventEnvelope = z.object({
  ...EventEnvelopeShape,
  payload: z.unknown(),
});
export type RawEventEnvelope = z.infer<typeof RawEventEnvelope>;

/**
 * Belirli bir payload şemasına sahip, tipli zarf üretir.
 *
 * @example
 * export const OutageCreatedEvent = envelopeOf(TOPICS.OUTAGE_CREATED, OutageCreatedPayload);
 */
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

/** createEnvelope'a verilen, otomatik doldurulmayan alanlar. */
export interface CreateEnvelopeInput<TType extends string, TPayload> {
  eventType: TType;
  payload: TPayload;
  origin: RecordOrigin;
  actor: string;
  correlationId: string;
  /** Bu event başka bir event'in sonucuysa, o event'in zarfını ver. */
  causedBy?: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

/**
 * Zarfı oluşturur; eventId, occurredAt ve depth otomatik dolar.
 * Üretici tarafında her zaman bunu kullan, elle nesne yazma.
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
 * Consumer'ın ilk savunma hattı: bu event işlenmeli mi?
 *
 * Yalnızca kullanıcı kaynaklı ve derinliği sınırın altındaki event'ler
 * karşı kayıt yaratır. Bunu her consumer'ın İLK satırında çağır.
 */
export function shouldTriggerCounterpart(envelope: Pick<RawEventEnvelope, 'origin' | 'depth'>): boolean {
  return envelope.origin === 'USER' && envelope.depth < MAX_EVENT_DEPTH;
}
