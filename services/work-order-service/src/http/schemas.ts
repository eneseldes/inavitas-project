import { PaginationQuery } from '@edas/shared';
import { z } from 'zod';
import { WORK_ORDER_STATUSES } from '../domain/state-machine.ts';

/** HTTP istek gövdelerinin/query'lerinin şemaları. Doğrulama sınırda yapılır, içeride değil. */

export const WorkOrderStatusEnum = z.enum(WORK_ORDER_STATUSES);

export const WorkOrderTypeEnum = z.enum([
  'BASIC_WORK',
  'LIGHTING_WORK_ORDER',
  'PLANNED_OUTAGE_WORK_ORDER',
  'UNPLANNED_OUTAGE_WORK_ORDER',
  'WITHOUT_OUTAGE_WORK_ORDER',
]);

export const CreateWorkOrderBody = z.object({
  gisId: z.string().min(1, 'gisId zorunlu').max(64),
  type: WorkOrderTypeEnum,
  status: WorkOrderStatusEnum.optional(),
});
export type CreateWorkOrderBody = z.infer<typeof CreateWorkOrderBody>;

export const PatchWorkOrderBody = z.object({
  status: WorkOrderStatusEnum,
  version: z.coerce.number().int().min(0, 'version zorunlu'),
});
export type PatchWorkOrderBody = z.infer<typeof PatchWorkOrderBody>;

/** Virgülle ayrılmış listeyi diziye çevirir: `status=STARTED,ASSIGNED`. */
const csv = z
  .string()
  .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean));

export const ListWorkOrdersQuery = PaginationQuery.extend({
  sort: z.string().optional(),
  status: csv.pipe(z.array(WorkOrderStatusEnum)).optional(),
  type: WorkOrderTypeEnum.optional(),
  gisId: z.string().optional(),
  createdAtFrom: z.string().optional(),
  createdAtTo: z.string().optional(),
  hasOutage: z.enum(['true', 'false']).optional(),
});
export type ListWorkOrdersQuery = z.infer<typeof ListWorkOrdersQuery>;
