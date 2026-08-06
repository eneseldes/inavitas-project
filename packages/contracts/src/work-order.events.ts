import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { GisId } from './outage.events.ts';
import { TOPICS } from './topics.ts';

/** İş emri durumları. DB enum'ı ile birebir aynı olmalı. */
export const WorkOrderStatus = z.enum([
  'STARTED', // açıldı
  'ASSIGNED', // ekibe atandı
  'IN_PROGRESS', // işlem başladı
  'ENERGIZED', // enerji verildi
  'DONE', // tamamlandı
  'CANCELLED', // her durumdan buraya geçilebilir
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatus>;

/** İş emri tipleri. */
export const WorkOrderType = z.enum([
  'BASIC_WORK', // temel/genel iş
  'LIGHTING_WORK_ORDER', // aydınlatma iş emri
  'PLANNED_OUTAGE_WORK_ORDER', // planlı kesinti iş emri — kesintiye sebep olabilir
  'UNPLANNED_OUTAGE_WORK_ORDER', // plansız kesinti iş emri — kesintiden otomatik doğan tip
  'WITHOUT_OUTAGE_WORK_ORDER', // kesintisiz iş emri
]);
export type WorkOrderType = z.infer<typeof WorkOrderType>;

export const WorkOrderCreatedPayload = z.object({
  workOrderId: z.uuid(),
  gisId: GisId,
  type: WorkOrderType,
  status: WorkOrderStatus,
  outageId: z.uuid().nullable(),
});
export type WorkOrderCreatedPayload = z.infer<typeof WorkOrderCreatedPayload>;

export const WorkOrderDonePayload = z.object({
  workOrderId: z.uuid(),
  gisId: GisId,
  type: WorkOrderType,
  doneAt: z.iso.datetime(),
  outageId: z.uuid().nullable(),
});
export type WorkOrderDonePayload = z.infer<typeof WorkOrderDonePayload>;

/** İş emrine kesinti bağlandı. Consumer'ı yalnızca UPDATE yapar. */
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
