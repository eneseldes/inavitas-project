import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { CbsId } from './outage.events.ts';
import { TOPICS } from './topics.ts';

/** İş emri durumları. */
export const WorkOrderStatus = z.enum([
  'STARTED', // Oluşturuldu
  'ASSIGNED', // Saha ekibine atandı
  'IN_PROGRESS', // Çalışma devam ediyor
  'ENERGIZED', // Enerji verildi
  'DONE', // Tamamlandı
  'CANCELLED', // İptal edildi
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatus>;

/** İş emri tipleri. */
export const WorkOrderType = z.enum([
  'BASIC_WORK', // Genel iş emri
  'LIGHTING_WORK_ORDER', // Aydınlatma iş emri
  'PLANNED_OUTAGE_WORK_ORDER', // Planlı kesinti iş emri
  'UNPLANNED_OUTAGE_WORK_ORDER', // Plansız kesinti sonucu otomatik oluşan iş emri
  'WITHOUT_OUTAGE_WORK_ORDER', // Kesintisiz çalışma iş emri
]);
export type WorkOrderType = z.infer<typeof WorkOrderType>;

export const WorkOrderCreatedPayload = z.object({
  workOrderId: z.uuid(),
  cbsId: CbsId,
  type: WorkOrderType,
  status: WorkOrderStatus,
  outageId: z.uuid().nullable(),
});
export type WorkOrderCreatedPayload = z.infer<typeof WorkOrderCreatedPayload>;

export const WorkOrderDonePayload = z.object({
  workOrderId: z.uuid(),
  cbsId: CbsId,
  type: WorkOrderType,
  doneAt: z.iso.datetime(),
  outageId: z.uuid().nullable(),
});
export type WorkOrderDonePayload = z.infer<typeof WorkOrderDonePayload>;

/**
 * İş emri iptal edildiğinde yayınlanır. `outage.cancelled` ile simetriktir; bağlı kesinti
 * bu olayla iptal edilir. Döngü koruması tüketimde `shouldTriggerCounterpart` ile yapılır.
 */
export const WorkOrderCancelledPayload = z.object({
  workOrderId: z.uuid(),
  cbsId: CbsId,
  cancelledAt: z.iso.datetime(),
  outageId: z.uuid().nullable(),
});
export type WorkOrderCancelledPayload = z.infer<typeof WorkOrderCancelledPayload>;

/**
 * İş emrine var olan bir kesinti bağlandığında yayınlanan event payload'ı.
 * Tüketici servisler bu event ile yeni kayıt açmaz, yalnızca mevcut iş emrini günceller.
 */
export const WorkOrderLinkedPayload = z.object({
  workOrderId: z.uuid(),
  outageId: z.uuid(),
});
export type WorkOrderLinkedPayload = z.infer<typeof WorkOrderLinkedPayload>;

export const WorkOrderCreatedEvent = envelopeOf(TOPICS.WORK_ORDER_CREATED, WorkOrderCreatedPayload);
export type WorkOrderCreatedEvent = z.infer<typeof WorkOrderCreatedEvent>;

export const WorkOrderDoneEvent = envelopeOf(
  TOPICS.WORK_ORDER_DONE,
  WorkOrderDonePayload,
);
export type WorkOrderDoneEvent = z.infer<typeof WorkOrderDoneEvent>;

export const WorkOrderLinkedEvent = envelopeOf(TOPICS.WORK_ORDER_LINKED, WorkOrderLinkedPayload);
export type WorkOrderLinkedEvent = z.infer<typeof WorkOrderLinkedEvent>;

export const WorkOrderCancelledEvent = envelopeOf(
  TOPICS.WORK_ORDER_CANCELLED,
  WorkOrderCancelledPayload,
);
export type WorkOrderCancelledEvent = z.infer<typeof WorkOrderCancelledEvent>;
