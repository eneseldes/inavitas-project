import { PaginationQuery } from '@inavitas/shared';
import { z } from 'zod';
import { WORK_ORDER_STATUSES } from '../domain/state-machine.ts';

export const WorkOrderStatusEnum = z.enum(WORK_ORDER_STATUSES);

export const WorkOrderTypeEnum = z.enum([
  'BASIC_WORK',
  'LIGHTING_WORK_ORDER',
  'PLANNED_OUTAGE_WORK_ORDER',
  'UNPLANNED_OUTAGE_WORK_ORDER',
  'WITHOUT_OUTAGE_WORK_ORDER',
]);

/** Yeni iş emri oluşturma istek gövdesi şeması. */
export const CreateWorkOrderBody = z.object({
  cbsId: z.string().min(1).max(64),
  type: WorkOrderTypeEnum,
  status: WorkOrderStatusEnum.optional(),
});
export type CreateWorkOrderBody = z.infer<typeof CreateWorkOrderBody>;

/** İş emri durum güncelleme (PATCH) istek gövdesi şeması. */
export const PatchWorkOrderBody = z.object({
  status: WorkOrderStatusEnum,
  version: z.coerce.number().int().min(0, 'version zorunlu'),
});
export type PatchWorkOrderBody = z.infer<typeof PatchWorkOrderBody>;

const csv = z
  .string()
  .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean));

/** Liste ve harita uçlarının paylaştığı filtre parametreleri. */
const workOrderFilterShape = {
  status: csv.pipe(z.array(WorkOrderStatusEnum)).optional(),
  origin: csv.pipe(z.array(z.enum(['USER', 'SYSTEM']))).optional(),
  type: csv.pipe(z.array(WorkOrderTypeEnum)).optional(),
  cbsId: z.string().optional(),
  /** İdari birim alt ağacı — `TR.06.012` altındaki tüm iş emirleri. */
  unitPath: z.string().optional(),
  createdAtFrom: z.string().optional(),
  createdAtTo: z.string().optional(),
  hasOutage: z.enum(['true', 'false']).optional(),
} as const;

/** İş emri listeleme sorgu (query) parametreleri şeması. */
export const ListWorkOrdersQuery = PaginationQuery.extend({
  sort: z.string().optional(),
  ...workOrderFilterShape,
});
export type ListWorkOrdersQuery = z.infer<typeof ListWorkOrdersQuery>;

/**
 * Harita katmanı sorgusu. Sayfalama yoktur — harita bir liste değil; bunun yerine sunucu
 * tarafında sert bir üst sınır uygulanır.
 */
export const WorkOrderMapQuery = z.object({
  ...workOrderFilterShape,
  limit: z.coerce.number().int().min(1).max(5_000).default(2_000),
});
export type WorkOrderMapQuery = z.infer<typeof WorkOrderMapQuery>;
