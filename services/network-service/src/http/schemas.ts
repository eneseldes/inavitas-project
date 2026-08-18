import { PaginationQuery } from '@inavitas/shared';
import { z } from 'zod';
import { BREAKER_ROLES, COMPONENT_CATEGORIES, COMPONENT_TYPES, UNIT_LEVELS, VOLTAGE_LEVELS } from '../domain/vocabulary.ts';

const csv = z
  .string()
  .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean));

/** İdari birim listeleme sorgu parametreleri şeması. */
export const ListUnitsQuery = PaginationQuery.extend({
  sort: z.string().optional(),
  level: z.enum(UNIT_LEVELS).optional(),
  parentPath: z.string().optional(),
});
export type ListUnitsQuery = z.infer<typeof ListUnitsQuery>;

/** Şebeke elemanı listeleme sorgu parametreleri şeması. */
export const ListComponentsQuery = PaginationQuery.extend({
  sort: z.string().optional(),
  type: csv.pipe(z.array(z.enum(COMPONENT_TYPES))).optional(),
  category: csv.pipe(z.array(z.enum(COMPONENT_CATEGORIES))).optional(),
  breakerRole: csv.pipe(z.array(z.enum(BREAKER_ROLES))).optional(),
  voltageLevel: csv.pipe(z.array(z.enum(VOLTAGE_LEVELS))).optional(),
  topologyLevel: z.coerce.number().int().min(0).optional(),
  unitPath: z.string().optional(),
  parentId: z.string().optional(),
  tmId: z.string().optional(),
  feederId: z.string().optional(),
  dmId: z.string().optional(),
  transformerId: z.string().optional(),
  q: z.string().min(1).optional(),
});
export type ListComponentsQuery = z.infer<typeof ListComponentsQuery>;

/** Abone listeleme sorgu parametreleri şeması. */
export const ListCustomersQuery = PaginationQuery.extend({
  sort: z.string().optional(),
  unitPath: z.string().optional(),
  customerType: z.string().optional(),
  status: z.string().optional(),
  parentId: z.string().optional(),
  tmId: z.string().optional(),
  feederId: z.string().optional(),
  dmId: z.string().optional(),
  transformerId: z.string().optional(),
});
export type ListCustomersQuery = z.infer<typeof ListCustomersQuery>;
