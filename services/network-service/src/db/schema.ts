import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Custom PostgreSQL ltree tipi */
export const ltree = customType<{ data: string }>({
  dataType() {
    return 'ltree';
  },
});

/** Custom PostgreSQL ltree[] dizisi tipi */
export const ltreeArray = customType<{ data: string[] }>({
  dataType() {
    return 'ltree[]';
  },
  toDriver(value: string[]): string {
    return `{${value.join(',')}}`;
  },
  fromDriver(value: unknown): string[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    }
    return [];
  },
});

/** Custom PostGIS geometry tipi */
export const geometry = customType<{ data: string }>({
  dataType() {
    return 'geometry';
  },
});

export const networkSchema = pgSchema('network');
export const customerSchema = pgSchema('customer');

/** İdari Birimler tablosu (`network.units`) */
export const units = networkSchema.table('units', {
  path: ltree('path').primaryKey(),
  parentPath: ltree('parent_path'),
  level: varchar('level', { length: 32 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  provinceName: varchar('province_name', { length: 255 }).notNull(),
  districtName: varchar('district_name', { length: 255 }),
  externalRef: varchar('external_ref', { length: 64 }),
  centerLat: doublePrecision('center_lat'),
  centerLon: doublePrecision('center_lon'),
  /**
   * İl/ilçe dolgu rengi bandı (0-7) — komşuluk grafiğinde çatışmasız boyanır (bkz.
   * `seed/04-unit-color-band.ts`). Eskiden `hashtext(path) % 8` ile anlık hesaplanıyordu;
   * komşuluğu bilmediğinden iki komşu ilçe aynı bandı alabiliyordu.
   */
  colorBand: integer('color_band'),
  geom: geometry('geom'),
  geomSimplified: geometry('geom_simplified'),
  centroid: geometry('centroid'),
  bbox: geometry('bbox'),
  hamlets: jsonb('hamlets'),
});

/** Şebeke Elemanları tablosu (`network.components`) */
export const components = networkSchema.table('components', {
  id: varchar('id', { length: 64 }).primaryKey(),
  type: varchar('type', { length: 64 }).notNull(),
  category: varchar('category', { length: 64 }).notNull(),
  breakerRole: varchar('breaker_role', { length: 64 }),
  voltageLevel: varchar('voltage_level', { length: 32 }).notNull(),
  topologyLevel: integer('topology_level').notNull(),
  parentId: varchar('parent_id', { length: 64 }),
  tmId: varchar('tm_id', { length: 64 }),
  feederId: varchar('feeder_id', { length: 64 }),
  dmId: varchar('dm_id', { length: 64 }),
  transformerId: varchar('transformer_id', { length: 64 }),
  unitPath: ltree('unit_path').notNull(),
  unitPaths: ltreeArray('unit_paths'),
  unitPathSource: varchar('unit_path_source', { length: 32 }).notNull(),
  geom: geometry('geom'),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  switchable: boolean('switchable').notNull().default(false),
  loadBreak: boolean('load_break').notNull().default(false),
  normallyOpen: boolean('normally_open').notNull().default(false),
  isClosed: boolean('is_closed').notNull().default(true),
  status: varchar('status', { length: 32 }).notNull(),
  isEnergized: boolean('is_energized').notNull().default(true),
  name: varchar('name', { length: 255 }),
  attributes: jsonb('attributes').notNull(),
});

/** Topoloji Kenarları tablosu (`network.topology_edges`) */
export const topologyEdges = networkSchema.table('topology_edges', {
  id: serial('id').primaryKey(),
  fromId: varchar('from_id', { length: 64 }).notNull(),
  toId: varchar('to_id', { length: 64 }).notNull(),
  connectionType: varchar('connection_type', { length: 64 }).notNull(),
  isClosed: boolean('is_closed').notNull().default(true),
  normallyOpen: boolean('normally_open').notNull().default(false),
  ringId: varchar('ring_id', { length: 64 }),
  participatesInOutageGraph: boolean('participates_in_outage_graph').notNull().default(true),
  componentId: varchar('component_id', { length: 64 }),
  lengthM: doublePrecision('length_m'),
});

/** Ring tanımları tablosu (`network.rings`) */
export const rings = networkSchema.table('rings', {
  ringId: varchar('ring_id', { length: 64 }).primaryKey(),
  ringType: varchar('ring_type', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  tmId: varchar('tm_id', { length: 64 }),
  tieSwitchIds: jsonb('tie_switch_ids'),
});

/** Manevra Günlüğü tablosu (`network.switching_operations`) */
export const switchingOperations = networkSchema.table('switching_operations', {
  id: uuid('id').defaultRandom().primaryKey(),
  componentId: varchar('component_id', { length: 64 }).notNull(),
  action: varchar('action', { length: 32 }).notNull(),
  performedBy: varchar('performed_by', { length: 255 }).notNull(),
  performedAt: timestamp('performed_at', { mode: 'date' }).defaultNow().notNull(),
});

/** Aboneler tablosu (`customer.customers`) */
export const customers = customerSchema.table('customers', {
  id: varchar('id', { length: 64 }).primaryKey(),
  parentId: varchar('parent_id', { length: 64 }).notNull(),
  tmId: varchar('tm_id', { length: 64 }),
  feederId: varchar('feeder_id', { length: 64 }),
  dmId: varchar('dm_id', { length: 64 }),
  transformerId: varchar('transformer_id', { length: 64 }),
  unitPath: ltree('unit_path').notNull(),
  unitPathSource: varchar('unit_path_source', { length: 32 }).notNull(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  customerType: varchar('customer_type', { length: 64 }),
  voltage: varchar('voltage', { length: 32 }),
  phase: varchar('phase', { length: 16 }),
  contractedPowerKw: doublePrecision('contracted_power_kw'),
  estimatedPeakKw: doublePrecision('estimated_peak_kw'),
  status: varchar('status', { length: 32 }),
  geom: geometry('geom'),
});

/** Abone PII (Tesisat/Sözleşme) tablosu (`customer.customer_pii`) */
export const customerPii = customerSchema.table('customer_pii', {
  id: varchar('id', { length: 64 }).primaryKey(),
  wiringId: varchar('wiring_id', { length: 64 }).notNull(),
  contractId: varchar('contract_id', { length: 64 }).notNull(),
});

/**
 * Kafka event idempotency takibi tablosu (çift işlemeyi önler).
 * `outage-service`/`work-order-service`'teki desenin birebir aynısıdır.
 */
export const processedEvents = pgTable('processed_events', {
  eventId: uuid('event_id').primaryKey(),
  topic: varchar('topic', { length: 128 }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Transactional outbox tablosu. `outage.created` tüketimi ve `outage.impact.calculated`
 * yayını AYNI transaction'da yazılır — dual-write yoktur.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    topic: varchar('topic', { length: 128 }).notNull(),
    partitionKey: varchar('partition_key', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
  },
  (table) => [index('idx_outbox_pending').on(table.createdAt).where(sql`${table.publishedAt} IS NULL`)],
);
