import {
  CONSUMER_GROUPS,
  parseEvent,
  SYSTEM_ACTOR,
  TOPICS,
  type OutageCreatedEvent,
  type OutageImpactCalculatedPayload,
} from '@inavitas/contracts';
import { markSeenOnce, ValidationError, withCorrelation, type EventHandler, type Logger } from '@inavitas/shared';
import { ZodError } from 'zod';
import { db } from '../db.ts';
import { getGraph } from '../graph/loader.ts';
import { computeDownstreamImpact } from '../modules/impact/service.ts';
import { markProcessed } from '../repository/idempotency.repository.ts';
import * as customersRepository from '../repository/customers.repository.ts';
import { redis } from '../redis.ts';
import { enqueueOutageImpactCalculatedTx } from './producer.ts';

/** İlk hesap her zaman 1. revizyondur; manevra sonrası yeniden hesap bunu artırır. */
const FIRST_REVISION = 1;

/**
 * 'outage.created' event'i işleyicisi: kesintinin bağlandığı elemanın aşağı akış etkisini
 * bellek-içi graf üzerinden hesaplar ve `outage.impact.calculated` olayını yayınlar.
 *
 * Servisler birbirini senkron HTTP ile çağırmadığından `outage-service` etkiyi sormaz;
 * hesap burada yapılır, sonuç olayla geri döner.
 */
export async function handleOutageCreated(envelope: OutageCreatedEvent, log: Logger): Promise<void> {
  const { outageId, cbsId } = envelope.payload;

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
}

const VALIDATORS = {
  [TOPICS.OUTAGE_CREATED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_CREATED, raw),
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
        return handleOutageCreated(envelope, log);
    }
  };
}
