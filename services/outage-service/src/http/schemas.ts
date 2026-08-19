import { PaginationQuery } from '@inavitas/shared';
import { z } from 'zod';
import { OUTAGE_STATUSES } from '../domain/state-machine.ts';

export const OutageStatusEnum = z.enum(OUTAGE_STATUSES);

export const OutageKindEnum = z.enum(['PLANNED', 'UNPLANNED']);

/** Yeni kesinti oluşturma istek gövdesi şeması. */
export const CreateOutageBody = z
  .object({
    cbsId: z.string().min(1).max(64),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).optional(),
    status: OutageStatusEnum.optional(),
    kind: OutageKindEnum.optional(),
  })
  .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(data.startedAt), {
    message: 'endedAt, startedAt\'tan önce olamaz',
    path: ['endedAt'],
  });
export type CreateOutageBody = z.infer<typeof CreateOutageBody>;

/** Kesinti güncelleme (PATCH) istek gövdesi şeması. */
export const PatchOutageBody = z
  .object({
    status: OutageStatusEnum.optional(),
    endedAt: z.iso.datetime({ offset: true }).optional(),
    version: z.coerce.number().int().min(0, 'version zorunlu'),
  })
  .refine((data) => data.status !== undefined || data.endedAt !== undefined, {
    message: 'status veya endedAt alanlarından en az biri gönderilmeli',
  });
export type PatchOutageBody = z.infer<typeof PatchOutageBody>;

const csv = z
  .string()
  .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean));

/** Liste ve harita uçlarının paylaştığı filtre parametreleri. */
const outageFilterShape = {
  status: csv.pipe(z.array(OutageStatusEnum)).optional(),
  origin: csv.pipe(z.array(z.enum(['USER', 'SYSTEM']))).optional(),
  cbsId: z.string().optional(),
  /** İdari birim alt ağacı — `TR.06.012` altındaki tüm kesintiler. */
  unitPath: z.string().optional(),
  componentType: csv.pipe(z.array(z.string().max(64))).optional(),
  startedAtFrom: z.string().optional(),
  startedAtTo: z.string().optional(),
  createdAtFrom: z.string().optional(),
  createdAtTo: z.string().optional(),
  endedAtFrom: z.string().optional(),
  endedAtTo: z.string().optional(),
  durationMinMinutes: z.coerce.number().int().optional(),
  durationMaxMinutes: z.coerce.number().int().optional(),
  minAffectedCustomers: z.coerce.number().int().min(0).optional(),
  maxAffectedCustomers: z.coerce.number().int().min(0).optional(),
  hasWorkOrder: z.enum(['true', 'false']).optional(),
} as const;

/** Kesinti listeleme sorgu (query) parametreleri şeması. */
export const ListOutagesQuery = PaginationQuery.extend({
  sort: z.string().optional(),
  ...outageFilterShape,
});
export type ListOutagesQuery = z.infer<typeof ListOutagesQuery>;

/**
 * Harita katmanı sorgusu. Sayfalama yoktur — harita bir liste değil, görünür kesintilerin
 * tamamını çizer; bunun yerine sunucu tarafında sert bir üst sınır uygulanır.
 */
export const OutageMapQuery = z.object({
  ...outageFilterShape,
  limit: z.coerce.number().int().min(1).max(5_000).default(2_000),
});
export type OutageMapQuery = z.infer<typeof OutageMapQuery>;
