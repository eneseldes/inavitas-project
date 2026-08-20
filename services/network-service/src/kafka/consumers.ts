import {
  CONSUMER_GROUPS,
  parseEvent,
  SYSTEM_ACTOR,
  TOPICS,
  type OutageCancelledEvent,
  type OutageCreatedEvent,
  type OutageEnergizedEvent,
  type OutageImpactCalculatedPayload,
} from '@inavitas/contracts';
import { markSeenOnce, ValidationError, withCorrelation, type EventHandler, type Logger } from '@inavitas/shared';
import { ZodError } from 'zod';
import { db } from '../db.ts';
import { getGraph } from '../graph/loader.ts';
import * as energizationService from '../modules/energization/service.ts';
import { computeDownstreamImpact } from '../modules/impact/service.ts';
import { markProcessed } from '../repository/idempotency.repository.ts';
import * as customersRepository from '../repository/customers.repository.ts';
import * as outageStatesRepository from '../repository/outage-states.repository.ts';
import { redis } from '../redis.ts';
import { enqueueOutageImpactCalculatedTx } from './producer.ts';

/** İlk hesap her zaman 1. revizyondur; manevra sonrası yeniden hesap bunu artırır. */
const FIRST_REVISION = 1;

/**
 * 'outage.created' event'i işleyicisi: kesintinin bağlandığı elemanın aşağı akış etkisini
 * bellek-içi graf üzerinden hesaplar ve `outage.impact.calculated` olayını yayınlar. Ayrıca
 * kesintiyi aktif kesinti read-model'ine yazar ve enerjilenmeyi yeniden hesaplatır.
 *
 * Servisler birbirini senkron HTTP ile çağırmadığından `outage-service` etkiyi sormaz;
 * hesap burada yapılır, sonuç olayla geri döner.
 */
export async function handleOutageCreated(envelope: OutageCreatedEvent, log: Logger): Promise<void> {
  const { outageId, cbsId, status, startedAt } = envelope.payload;

  // Graf düğüm evreninde olmayan bir kimlik: `outage-service` kendi read-model'inde zaten
  // doğruluyor, buraya düşmesi read-model'in bayatladığı anlamına gelir — hesap yapılamaz.
  if (!getGraph().nodeIndex.has(cbsId)) {
    log.warn({ outageId, cbsId }, 'kesintinin CBS elemanı grafta yok, etki hesaplanamadı');
    return;
  }

  const impact = computeDownstreamImpact(cbsId);

  // Abone özetleri (PII'sız) etkiyle birlikte taşınır — `outage-service` bunları doğrudan
  // `outage_affected_customers` read-model'ine yazar, ayrıca sormaz.
  const customers = await customersRepository.findAffectedByIds(impact.affectedCustomerIds);

  const payload: OutageImpactCalculatedPayload = {
    outageId,
    cbsId,
    revision: FIRST_REVISION,
    affectedElementIds: impact.affectedElementIds,
    affectedElementCount: impact.affectedElementCount,
    affectedCustomerCount: impact.affectedCustomerCount,
    customers: customers.map((row) => ({
      customerId: row.id,
      unitPath: row.unitPath,
      customerType: row.customerType,
    })),
    overflowed: impact.overflowed,
    radialityViolated: impact.radialityViolated,
  };

  const published = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.OUTAGE_CREATED);
    if (!processed) return false;

    // Read-model yazımı ile idempotency kaydı aynı transaction'da — dual-write yoktur.
    await outageStatesRepository.upsertTx(tx, {
      outageId,
      cbsId,
      status,
      startedAt: new Date(startedAt),
    });

    await enqueueOutageImpactCalculatedTx(tx, payload, {
      origin: 'SYSTEM',
      actor: SYSTEM_ACTOR,
      correlationId: envelope.correlationId,
      causedBy: envelope,
    });

    return true;
  });

  if (!published) {
    log.debug({ eventId: envelope.eventId }, 'event zaten işlenmiş, atlanıyor');
    return;
  }

  log.info(
    {
      outageId,
      cbsId,
      affectedElementCount: impact.affectedElementCount,
      affectedCustomerCount: impact.affectedCustomerCount,
      radialityViolated: impact.radialityViolated,
    },
    'kesinti etkisi hesaplandı',
  );

  // Bitiş zamanı verilerek açılan kesinti doğrudan `ENERGIZED` doğar — onu cut kümesine
  // eklemek şebekenin yarısını boşuna karartır. Yeniden hesap yalnız aktif (`STARTED`)
  // satırları okur, o yüzden burada koşul gerekmez; ama hesabı boşuna tetiklememek için
  // durum kontrol edilir.
  if (status === outageStatesRepository.ACTIVE_OUTAGE_STATUS) {
    await energizationService.refresh(log);
  }
}

/**
 * 'outage.energized' işleyicisi: kesinti sona erdi, read-model güncellenir ve karartılan
 * bölge yeniden enerjilendirilir.
 */
export async function handleOutageEnergized(envelope: OutageEnergizedEvent, log: Logger): Promise<void> {
  await applyOutageStateChange(envelope, TOPICS.OUTAGE_ENERGIZED, 'ENERGIZED', log);
}

/**
 * 'outage.cancelled' işleyicisi: kesinti iptal edildi, cut kümesinden düşer.
 *
 * `network-service`'in yeniden enerjilendirmesi yalnız bu olaya bağlıdır. Kesinti nasıl
 * iptal edilirse edilsin olay yayınlanmak zorundadır; atlanırsa karanlık bölge sonsuza kadar
 * karanlık kalır.
 */
export async function handleOutageCancelled(envelope: OutageCancelledEvent, log: Logger): Promise<void> {
  await applyOutageStateChange(envelope, TOPICS.OUTAGE_CANCELLED, 'CANCELLED', log);
}

/** İki durum-değişimi işleyicisinin ortak gövdesi: read-model'i güncelle, yeniden hesapla. */
async function applyOutageStateChange(
  envelope: OutageCancelledEvent | OutageEnergizedEvent,
  topic: typeof TOPICS.OUTAGE_CANCELLED | typeof TOPICS.OUTAGE_ENERGIZED,
  nextStatus: string,
  log: Logger,
): Promise<void> {
  const { outageId, cbsId } = envelope.payload;

  const applied = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, topic);
    if (!processed) return false;

    await outageStatesRepository.updateStatusTx(tx, outageId, nextStatus);
    return true;
  });

  if (!applied) {
    log.debug({ eventId: envelope.eventId }, 'event zaten işlenmiş, atlanıyor');
    return;
  }

  const state = await energizationService.refresh(log);
  log.info(
    { outageId, cbsId, nextStatus, version: state.version, deEnergizedCount: state.deEnergizedCount },
    'kesinti durumu değişti, enerjilenme güncellendi',
  );
}

const VALIDATORS = {
  [TOPICS.OUTAGE_CREATED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_CREATED, raw),
  [TOPICS.OUTAGE_ENERGIZED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_ENERGIZED, raw),
  [TOPICS.OUTAGE_CANCELLED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_CANCELLED, raw),
} as const;

/**
 * network-service Kafka event dinleyici işleyicisi.
 */
export function createNetworkEventHandler(logger: Logger): EventHandler {
  return async (topic, message) => {
    const validate = VALIDATORS[topic as keyof typeof VALIDATORS];
    if (!validate) {
      logger.warn({ topic }, 'bilinmeyen topic, atlanıyor');
      return;
    }

    let envelope: ReturnType<typeof validate>;
    try {
      envelope = validate(message);
    } catch (err) {
      const details =
        err instanceof ZodError ? err.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })) : undefined;
      throw new ValidationError('Kafka event şeması geçersiz', details);
    }

    const log = withCorrelation(logger, envelope.correlationId, {
      eventId: envelope.eventId,
      eventType: envelope.eventType,
    });

    // Postgres veri tabanındaki idempotency kontrolüne ek olarak Redis ön filtresi kullanılır.
    // Anahtar consumer group'la ayrılır: aynı topic'i başka bir servis de dinliyor olabilir
    // ve ortak Redis'te ayrılmamış anahtar diğerinin olayı atlamasına yol açar.
    if (!(await markSeenOnce(redis, CONSUMER_GROUPS.NETWORK_SERVICE, envelope.eventId))) {
      log.debug({ eventId: envelope.eventId }, 'redis ön filtresi: muhtemelen zaten işlenmiş, atlanıyor');
      return;
    }

    switch (topic) {
      case TOPICS.OUTAGE_CREATED:
        return handleOutageCreated(envelope as OutageCreatedEvent, log);
      case TOPICS.OUTAGE_ENERGIZED:
        return handleOutageEnergized(envelope as OutageEnergizedEvent, log);
      case TOPICS.OUTAGE_CANCELLED:
        return handleOutageCancelled(envelope as OutageCancelledEvent, log);
    }
  };
}
