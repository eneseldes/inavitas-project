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

/** Vector tile `z/x/y` yol parametreleri şeması. */
export const TileParams = z.object({
  z: z.coerce.number().int().min(0).max(22),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});
export type TileParams = z.infer<typeof TileParams>;

/** Eleman izi (trace) sorgu parametreleri şeması. */
export const TraceQuery = z.object({
  direction: z.enum(['up', 'down']),
});
export type TraceQuery = z.infer<typeof TraceQuery>;

/**
 * Enerjisizlik sorgusu parametreleri.
 *
 * `bbox` neden zorunlu: `setFeatureState` yalnız **yüklü** tile'lara yazılabilir. Ekranda
 * olmayan bir elemanın durumunu taşımanın faydası yok, maliyeti var.
 */
export const EnergizationQuery = z.object({
  bbox: csv
    .pipe(z.array(z.string()).length(4))
    .transform((parts) => parts.map(Number))
    .refine((values) => values.every(Number.isFinite), { message: 'bbox sayısal olmalı' })
    .transform(([minLon, minLat, maxLon, maxLat]) => ({
      minLon: minLon!,
      minLat: minLat!,
      maxLon: maxLon!,
      maxLat: maxLat!,
    })),
  zoom: z.coerce.number().min(0).max(22),
});
export type EnergizationQuery = z.infer<typeof EnergizationQuery>;

/**
 * Alan (poligon) sorgusu gövdesi.
 *
 * Poligon **gövdede** taşınır, query string'de değil: bir mahalleyi saran poligon
 * kolayca birkaç kilobayt tutar ve URL sınırına takılır.
 */
const GeoJsonPolygon = z.object({
  type: z.literal('Polygon'),
  // Dış halka + delikler. Kapalı bir halkanın en az 4 noktası vardır (son nokta ilkiyle aynı).
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1),
});
export type GeoJsonPolygon = z.infer<typeof GeoJsonPolygon>;

export const QueryWithinBody = PaginationQuery.extend({
  polygon: GeoJsonPolygon,
  // Filtreler `/components` ile aynı sözlükten gelir; alan sorgusuna paralel bir filtre
  // modeli kurulmaz. Gövdede taşındıkları için virgüllü metin değil, dizi olarak gelirler.
  type: z.array(z.enum(COMPONENT_TYPES)).optional(),
  category: z.array(z.enum(COMPONENT_CATEGORIES)).optional(),
  breakerRole: z.array(z.enum(BREAKER_ROLES)).optional(),
  voltageLevel: z.array(z.enum(VOLTAGE_LEVELS)).optional(),
  q: z.string().min(1).optional(),
});
export type QueryWithinBody = z.infer<typeof QueryWithinBody>;

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
