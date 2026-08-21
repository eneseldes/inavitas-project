import {
  CONSUMER_GROUPS,
  parseEvent,
  shouldTriggerCounterpart,
  SYSTEM_ACTOR,
  TOPICS,
  type OutageEnergizedEvent,
  type OutageImpactCalculatedEvent,
  type WorkOrderCancelledEvent,
  type WorkOrderCreatedEvent,
  type WorkOrderDoneEvent,
  type WorkOrderLinkedEvent,
} from '@inavitas/contracts';
import { markSeenOnce, ValidationError, withCorrelation, type EventHandler, type Logger } from '@inavitas/shared';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from '../db.ts';
import { outages } from '../db/schema.ts';
import { canTransition } from '../domain/state-machine.ts';
import { applyCascade, resolveChildOutages } from '../modules/cascade/service.ts';
import { ComponentNotFoundError } from '@inavitas/shared';
import * as networkComponentRepository from '../repository/network-component.repository.ts';
import { markProcessed } from '../repository/idempotency.repository.ts';
import * as outageRepository from '../repository/outage.repository.ts';
import { applyImpactTx, createTx, linkWorkOrderTx, updateWithVersionTx } from '../repository/outage.repository.ts';
import { redis } from '../redis.ts';
import { notifyOutageChanged } from '../realtime.ts';
import {
  enqueueOutageCancelledIfNeededTx,
  enqueueOutageCreatedTx,
  enqueueOutageEnergizedIfNeededTx,
  enqueueOutageLinkedTx,
} from './producer.ts';

/**
 * 'work-order.created' event'i işleyicisi: Kullanıcı kaynaklı bir iş emri oluştuğunda otomatik sistem kesintisi oluşturur.
 */
export async function handleWorkOrderCreated(envelope: WorkOrderCreatedEvent, log: Logger): Promise<void> {
  if (!shouldTriggerCounterpart(envelope)) {
    log.debug({ eventId: envelope.eventId }, 'sistem kaynaklı/derinlik aşıldı, atlanıyor');
    return;
  }
  if (envelope.payload.outageId) {
    log.debug({ eventId: envelope.eventId }, 'iş emri zaten bir kesintiye bağlı, atlanıyor');
    return;
  }

  // Otomatik kesinti de geçerli bir CBS elemanına bağlanmak zorundadır; read-model'de
  // karşılığı yoksa kesinti açılmaz (kayıt "asdasd" gibi bir kimlikle doğmaz).
  const component = await networkComponentRepository.findById(envelope.payload.cbsId);
  if (!component) {
    log.error({ cbsId: envelope.payload.cbsId }, 'iş emrinin CBS elemanı read-model\'de yok, kesinti açılmadı');
    throw new ComponentNotFoundError(envelope.payload.cbsId);
  }

  // Eleman hâlihazırda aktif bir kesintinin etki kümesindeyse **ikinci bir sistem kesintisi
  // açılmaz**; iş emri o kesintiye bağlanır.
  //
  // Neden: aksi halde `POST /outages`'in enerjisizlik kapısı kendi sistemimiz tarafından
  // delinirdi — kullanıcı iş emri açar, bu consumer kapıdan geçmeden ikinci kesinti doğururdu.
  const existing = await findExistingOutageFor(envelope.payload.cbsId);
  if (existing) {
    await linkWorkOrderToExistingOutage(existing, envelope, log);
    return;
  }

  const created = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.WORK_ORDER_CREATED);
    if (!processed) return null;

    const row = await createTx(
      tx,
      {
        cbsId: envelope.payload.cbsId,
        startedAt: new Date(),
        endedAt: null,
        status: 'STARTED',
        origin: 'SYSTEM',
        createdBy: SYSTEM_ACTOR,
        workOrderId: envelope.payload.workOrderId,
        unitPath: component.unitPath,
        componentType: component.type,
        componentName: component.name,
        topologyLevel: component.topologyLevel,
      },
      envelope.correlationId,
    );

    // Sistem kesintisi de tıpkı kullanıcının açtığı gibi 'outage.created' yayınlar —
    // etki hesabı bu olaya bağlıdır. `origin: 'SYSTEM'` olduğu için work-order-service
    // bunu görüp ikinci bir iş emri açmaz (shouldTriggerCounterpart).
    await enqueueOutageCreatedTx(tx, row, {
      origin: 'SYSTEM',
      actor: SYSTEM_ACTOR,
      correlationId: envelope.correlationId,
      causedBy: envelope,
    });

    await enqueueOutageLinkedTx(tx, row.id, row.cbsId, envelope.payload.workOrderId, {
      origin: 'SYSTEM',
      actor: SYSTEM_ACTOR,
      correlationId: envelope.correlationId,
      causedBy: envelope,
    });

    return row;
  });

  if (!created) {
    log.debug({ eventId: envelope.eventId }, 'event zaten işlenmiş, atlanıyor');
    return;
  }

  log.info(
    { outageId: created.id, workOrderId: envelope.payload.workOrderId, cbsId: created.cbsId },
    'iş emrinden otomatik kesinti oluşturuldu',
  );

  await notifyOutageChanged(created, log);
}

/**
 * İş emrinin elemanını karartan mevcut kesintiyi arar: önce elemanın kendi üzerindeki aktif
 * kesinti, sonra onu etki kümesinde taşıyan en yakın üst kesinti.
 */
async function findExistingOutageFor(cbsId: string) {
  const onSelf = await outageRepository.findActiveByCbsId(cbsId);
  if (onSelf) return onSelf;

  const [containing] = await outageRepository.findContainingOutages(cbsId);
  return containing ?? null;
}

/** İş emrini yeni kesinti açmadan mevcut kesintiye bağlar. */
async function linkWorkOrderToExistingOutage(
  existing: outageRepository.OutageRow,
  envelope: WorkOrderCreatedEvent,
  log: Logger,
): Promise<void> {
  const linked = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.WORK_ORDER_CREATED);
    if (!processed) return null;

    const row = await linkWorkOrderTx(tx, existing.id, envelope.payload.workOrderId);
    if (!row) return null;

    await enqueueOutageLinkedTx(tx, row.id, row.cbsId, envelope.payload.workOrderId, {
      origin: 'SYSTEM',
      actor: SYSTEM_ACTOR,
      correlationId: envelope.correlationId,
      causedBy: envelope,
    });

    return row;
  });

  if (!linked) {
    log.debug({ eventId: envelope.eventId }, 'event zaten işlenmiş veya kesinti bağlanamadı, atlanıyor');
    return;
  }

  log.info(
    { outageId: linked.id, workOrderId: envelope.payload.workOrderId, cbsId: linked.cbsId },
    'iş emri mevcut kesintiye bağlandı (yeni sistem kesintisi açılmadı)',
  );

  await notifyOutageChanged(linked, log);
}

/**
 * 'work-order.linked' event'i işleyicisi: Kesintiyi ilgili iş emrine bağlar.
 */
export async function handleWorkOrderLinked(envelope: WorkOrderLinkedEvent, log: Logger): Promise<void> {
  const updated = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.WORK_ORDER_LINKED);
    if (!processed) return null;

    return linkWorkOrderTx(tx, envelope.payload.outageId, envelope.payload.workOrderId);
  });

  if (!updated) {
    log.debug({ eventId: envelope.eventId }, 'zaten işlenmiş veya kesinti bulunamadı, atlanıyor');
    return;
  }

  log.info({ outageId: updated.id, workOrderId: envelope.payload.workOrderId }, 'kesinti iş emrine bağlandı');

  await notifyOutageChanged(updated, log);
}

/**
 * 'work-order.done' event'i işleyicisi: Bağlı iş emri tamamlandığında kesintiyi otomatik ENERGIZED yapar.
 */
export async function handleWorkOrderDone(envelope: WorkOrderDoneEvent, log: Logger): Promise<void> {
  if (!envelope.payload.outageId) {
    log.debug({ eventId: envelope.eventId }, 'iş emri bir kesintiye bağlı değil, atlanıyor');
    return;
  }

  const result = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.WORK_ORDER_DONE);
    if (!processed) return null;

    const [current] = await tx.select().from(outages).where(eq(outages.id, envelope.payload.outageId!));
    if (!current) {
      log.warn({ outageId: envelope.payload.outageId }, 'bağlı kesinti bulunamadı');
      return null;
    }

    if (!canTransition(current.status, 'ENERGIZED')) {
      return { previousStatus: current.status, row: current };
    }

    const now = new Date();
    const updated = await updateWithVersionTx(
      tx,
      current.id,
      current.version,
      { status: 'ENERGIZED', endedAt: current.endedAt ?? now },
      { fromStatus: current.status, actor: SYSTEM_ACTOR, origin: 'SYSTEM', correlationId: envelope.correlationId },
    );
    if (!updated) return null;

    // Fonksiyon kendi içinde no-op koruması yapıyor (durum zaten ENERGIZED'sa
    // yazmıyor); bu yüzden burada koşulsuz çağırmak güvenli.
    await enqueueOutageEnergizedIfNeededTx(tx, current.status, updated, {
      origin: 'SYSTEM',
      actor: SYSTEM_ACTOR,
      correlationId: envelope.correlationId,
      causedBy: envelope,
    });

    return { previousStatus: current.status, row: updated };
  });

  if (!result) {
    log.debug({ eventId: envelope.eventId }, 'zaten işlenmiş veya version çakışması, atlanıyor');
    return;
  }

  if (result.previousStatus === result.row.status) {
    log.debug({ outageId: result.row.id, status: result.row.status }, 'kesinti zaten bu durumda, ENERGIZED atlanıyor');
    return;
  }

  log.info({ outageId: result.row.id, workOrderId: envelope.payload.workOrderId }, 'iş emri tamamlandı, kesinti otomatik ENERGIZED yapıldı');

  await notifyOutageChanged(result.row, log);
}

/**
 * 'outage.impact.calculated' event'i işleyicisi: `network-service`'in hesapladığı etkiyi
 * geri yazar, ardından kaskad ilişkilerini kurar.
 *
 * Etki yazımı ve idempotency kaydı aynı transaction'dadır; kaskad ise ayrı transaction'larda
 * yürür — bir kaskad bağı kurulamasa bile etki verisi kaybolmaz (etki, kaskadın ön koşuludur,
 * tersi değil).
 */
export async function handleOutageImpactCalculated(envelope: OutageImpactCalculatedEvent, log: Logger): Promise<void> {
  const { outageId, revision, customers, affectedElementIds } = envelope.payload;

  const updated = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.OUTAGE_IMPACT_CALCULATED);
    if (!processed) return null;

    return applyImpactTx(tx, {
      outageId,
      revision,
      affectedElementIds,
      affectedElementCount: envelope.payload.affectedElementCount,
      affectedCustomerCount: envelope.payload.affectedCustomerCount,
      customers,
      overflowed: envelope.payload.overflowed,
      radialityViolated: envelope.payload.radialityViolated,
    });
  });

  if (!updated) {
    log.debug({ eventId: envelope.eventId }, 'zaten işlenmiş veya kesinti bulunamadı, atlanıyor');
    return;
  }

  log.info(
    {
      outageId,
      revision,
      affectedCustomerCount: envelope.payload.affectedCustomerCount,
      impactStatus: updated.impactStatus,
    },
    'kesinti etkisi kaydedildi',
  );

  await notifyOutageChanged(updated, log);

  // Radyallik bozulduysa etki kümesi güvenilir değildir — üzerine kaskad kurulmaz.
  if (envelope.payload.radialityViolated) {
    log.warn({ outageId }, 'radyallik varsayımı bozuk, kaskad değerlendirmesi atlandı');
    return;
  }

  // Kaskad kararının girdisi artık `affectedElementIds` DEĞİL: kimin kimi kapsadığını
  // `network-service` kırpılmamış küme üzerinden hesaplayıp olayda iki hazır alanla
  // gönderiyor (bkz. `onceden-yapilanlar.md` §11.4).
  const cascade = await applyCascade(
    updated,
    {
      containedOutageIds: envelope.payload.containedOutageIds,
      containingOutageId: envelope.payload.containingOutageId,
    },
    { correlationId: envelope.correlationId, causedBy: envelope },
    log,
  );

  // Kaskad bağı kesintinin kendisini de (parentOutageId) alt kesintileri de değiştirir;
  // açık duran ekranlar bunu SSE ile görmeli, sayfa yenilemeyle değil.
  const changedIds = [
    ...(cascade.parentOutageId === null ? [] : [updated.id]),
    ...cascade.supersededOutageIds,
  ];
  for (const id of changedIds) {
    const row = await outageRepository.findById(id);
    if (row) await notifyOutageChanged(row, log);
  }
}

/**
 * 'outage.energized' event'i işleyicisi: üst kesinti enerjilenince kapsanan alt kesintileri
 * doğrulayarak kapatır (otomatik çözülme).
 */
export async function handleOutageEnergized(envelope: OutageEnergizedEvent, log: Logger): Promise<void> {
  const parent = await outageRepository.findById(envelope.payload.outageId);
  if (!parent) {
    log.debug({ outageId: envelope.payload.outageId }, 'kesinti bulunamadı, otomatik çözülme atlanıyor');
    return;
  }

  const processed = await db.transaction((tx) => markProcessed(tx, envelope.eventId, TOPICS.OUTAGE_ENERGIZED));
  if (!processed) {
    log.debug({ eventId: envelope.eventId }, 'event zaten işlenmiş, atlanıyor');
    return;
  }

  const resolved = await resolveChildOutages(
    parent,
    new Date(envelope.payload.endedAt),
    { correlationId: envelope.correlationId, causedBy: envelope },
    log,
  );

  for (const id of resolved) {
    const row = await outageRepository.findById(id);
    if (row) await notifyOutageChanged(row, log);
  }
}

/**
 * 'work-order.cancelled' işleyicisi: iş emri iptal edilince bağlı kesinti de iptal edilir
 * (iptal simetrisi).
 *
 * `shouldTriggerCounterpart` kontrolü **zorunludur**. `work-order-service`'in
 * kendi iptalinden doğan olay `origin: 'SYSTEM'` taşır; kontrol olmasa iki servis birbirini
 * sonsuza kadar iptal ederdi. Zincir burada durur.
 */
export async function handleWorkOrderCancelled(envelope: WorkOrderCancelledEvent, log: Logger): Promise<void> {
  if (!shouldTriggerCounterpart(envelope)) {
    log.debug({ eventId: envelope.eventId }, 'sistem kaynaklı/derinlik aşıldı, karşı iptal tetiklenmiyor');
    return;
  }
  if (!envelope.payload.outageId) {
    log.debug({ eventId: envelope.eventId }, 'iş emri bir kesintiye bağlı değil, atlanıyor');
    return;
  }

  const result = await db.transaction(async (tx) => {
    const processed = await markProcessed(tx, envelope.eventId, TOPICS.WORK_ORDER_CANCELLED);
    if (!processed) return null;

    const [current] = await tx.select().from(outages).where(eq(outages.id, envelope.payload.outageId!));
    if (!current) {
      log.warn({ outageId: envelope.payload.outageId }, 'bağlı kesinti bulunamadı');
      return null;
    }

    if (!canTransition(current.status, 'CANCELLED')) {
      return { previousStatus: current.status, row: current, detachedChildren: [] as typeof outages.$inferSelect[] };
    }

    const updated = await updateWithVersionTx(
      tx,
      current.id,
      current.version,
      { status: 'CANCELLED' },
      { fromStatus: current.status, actor: SYSTEM_ACTOR, origin: 'SYSTEM', correlationId: envelope.correlationId },
    );
    if (!updated) return null;

    // Karşılık olayı SYSTEM olarak yayınlanır; work-order-service onu tüketirken
    // `shouldTriggerCounterpart` false döner ve döngü kapanır.
    await enqueueOutageCancelledIfNeededTx(tx, current.status, updated, {
      origin: 'SYSTEM',
      actor: SYSTEM_ACTOR,
      correlationId: envelope.correlationId,
      causedBy: envelope,
    });

    const detachedChildren = await outageRepository.detachChildrenTx(tx, updated.id);
    await outageRepository.clearAffectedCustomersTx(tx, updated.id);

    return { previousStatus: current.status, row: updated, detachedChildren };
  });

  if (!result) {
    log.debug({ eventId: envelope.eventId }, 'zaten işlenmiş veya version çakışması, atlanıyor');
    return;
  }

  if (result.previousStatus === result.row.status) {
    log.info(
      { outageId: result.row.id, status: result.row.status },
      'kesinti iptal edilebilir durumda değil, atlandı',
    );
    return;
  }

  log.info(
    { outageId: result.row.id, workOrderId: envelope.payload.workOrderId, detachedCount: result.detachedChildren.length },
    'iş emri iptal edildi, bağlı kesinti otomatik CANCELLED yapıldı',
  );

  await notifyOutageChanged(result.row, log);
  for (const child of result.detachedChildren) await notifyOutageChanged(child, log);
}

const VALIDATORS = {
  [TOPICS.WORK_ORDER_CREATED]: (raw: unknown) => parseEvent(TOPICS.WORK_ORDER_CREATED, raw),
  [TOPICS.WORK_ORDER_LINKED]: (raw: unknown) => parseEvent(TOPICS.WORK_ORDER_LINKED, raw),
  [TOPICS.WORK_ORDER_DONE]: (raw: unknown) => parseEvent(TOPICS.WORK_ORDER_DONE, raw),
  [TOPICS.WORK_ORDER_CANCELLED]: (raw: unknown) => parseEvent(TOPICS.WORK_ORDER_CANCELLED, raw),
  [TOPICS.OUTAGE_IMPACT_CALCULATED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_IMPACT_CALCULATED, raw),
  [TOPICS.OUTAGE_ENERGIZED]: (raw: unknown) => parseEvent(TOPICS.OUTAGE_ENERGIZED, raw),
} as const;

/**
 * outage-service Kafka event dinleyici işleyicisi (event handler).
 */
export function createOutageEventHandler(logger: Logger): EventHandler {
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
      const details = err instanceof ZodError ? err.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })) : undefined;
      throw new ValidationError('Kafka event şeması geçersiz', details);
    }

    const log = withCorrelation(logger, envelope.correlationId, { eventId: envelope.eventId, eventType: envelope.eventType });

    // Postgres veri tabanındaki idempotency kontrolüne ek olarak Redis ön filtresi kullanılır.
    // Anahtar consumer group'la ayrılır: aynı topic'i başka bir servis de dinliyor olabilir
    // ve ortak Redis'te ayrılmamış anahtar diğerinin olayı atlamasına yol açar.
    if (!(await markSeenOnce(redis, CONSUMER_GROUPS.OUTAGE_SERVICE, envelope.eventId))) {
      log.debug({ eventId: envelope.eventId }, 'redis ön filtresi: muhtemelen zaten işlenmiş, atlanıyor');
      return;
    }

    switch (topic) {
      case TOPICS.WORK_ORDER_CREATED:
        return handleWorkOrderCreated(envelope as WorkOrderCreatedEvent, log);
      case TOPICS.WORK_ORDER_LINKED:
        return handleWorkOrderLinked(envelope as WorkOrderLinkedEvent, log);
      case TOPICS.WORK_ORDER_DONE:
        return handleWorkOrderDone(envelope as WorkOrderDoneEvent, log);
      case TOPICS.WORK_ORDER_CANCELLED:
        return handleWorkOrderCancelled(envelope as WorkOrderCancelledEvent, log);
      case TOPICS.OUTAGE_IMPACT_CALCULATED:
        return handleOutageImpactCalculated(envelope as OutageImpactCalculatedEvent, log);
      case TOPICS.OUTAGE_ENERGIZED:
        return handleOutageEnergized(envelope as OutageEnergizedEvent, log);
    }
  };
}
