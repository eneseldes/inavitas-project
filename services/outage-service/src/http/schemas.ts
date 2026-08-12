import { PaginationQuery } from '@inavitas/shared';
import { z } from 'zod';
import { OUTAGE_STATUSES } from '../domain/state-machine.ts';

export const OutageStatusEnum = z.enum(OUTAGE_STATUSES);

/** Yeni kesinti oluşturma istek gövdesi şeması. */
export const CreateOutageBody = z
  .object({
    gisId: z.string().min(1, 'gisId zorunlu').max(64),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).optional(),
    status: OutageStatusEnum.optional(),
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

/** Kesinti listeleme sorgu (query) parametreleri şeması. */
export const ListOutagesQuery = PaginationQuery.extend({
  sort: z.string().optional(),
  status: csv.pipe(z.array(OutageStatusEnum)).optional(),
  origin: csv.pipe(z.array(z.enum(['USER', 'SYSTEM']))).optional(),
  gisId: z.string().optional(),
  startedAtFrom: z.string().optional(),
  startedAtTo: z.string().optional(),
  createdAtFrom: z.string().optional(),
  createdAtTo: z.string().optional(),
  endedAtFrom: z.string().optional(),
  endedAtTo: z.string().optional(),
  durationMinMinutes: z.coerce.number().int().optional(),
  durationMaxMinutes: z.coerce.number().int().optional(),
  hasWorkOrder: z.enum(['true', 'false']).optional(),
});
export type ListOutagesQuery = z.infer<typeof ListOutagesQuery>;
