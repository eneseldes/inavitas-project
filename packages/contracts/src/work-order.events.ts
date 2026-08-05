import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { GisId } from './outage.events.ts';
import { TOPICS } from './topics.ts';

/** İş emri durumları. DB enum'ı ile birebir aynı olmalı. */
export const WorkOrderStatus = z.enum([
  'CREATED',
  'ASSIGNED', // ekibe atandı
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatus>;

/** İş emri tipleri. */
export const WorkOrderType = z.enum([
  'FAULT_REPAIR', // arıza onarımı — kesintiden otomatik doğan tip
  'PLANNED_MAINTENANCE', // planlı bakım — kesintiye sebep olabilir
  'INSPECTION', // kontrol / muayene
  'METER_OPERATION', // sayaç işlemi
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

export const WorkOrderCompletedPayload = z.object({
  workOrderId: z.uuid(),
  gisId: GisId,
  type: WorkOrderType,
  completedAt: z.iso.datetime(),
  outageId: z.uuid().nullable(),
});
export type WorkOrderCompletedPayload = z.infer<typeof WorkOrderCompletedPayload>;

/** İş emrine kesinti bağlandı. Consumer'ı yalnızca UPDATE yapar. */
export const WorkOrderLinkedPayload = z.object({
  workOrderId: z.uuid(),
  outageId: z.uuid(),
});
export type WorkOrderLinkedPayload = z.infer<typeof WorkOrderLinkedPayload>;

export const WorkOrderCreatedEvent = envelopeOf(TOPICS.WORK_ORDER_CREATED, WorkOrderCreatedPayload);
export type WorkOrderCreatedEvent = z.infer<typeof WorkOrderCreatedEvent>;

export const WorkOrderCompletedEvent = envelopeOf(
  TOPICS.WORK_ORDER_COMPLETED,
  WorkOrderCompletedPayload,
);
export type WorkOrderCompletedEvent = z.infer<typeof WorkOrderCompletedEvent>;

export const WorkOrderLinkedEvent = envelopeOf(TOPICS.WORK_ORDER_LINKED, WorkOrderLinkedPayload);
export type WorkOrderLinkedEvent = z.infer<typeof WorkOrderLinkedEvent>;
