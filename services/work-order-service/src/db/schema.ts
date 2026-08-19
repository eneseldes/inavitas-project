import { sql } from 'drizzle-orm';
import {
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * PostgreSQL `ltree` tipi — idari birim yolu (`TR.06.012.0137`), `network_db`'deki ile
 * birebir aynı tiptir.
 */
export const ltree = customType<{ data: string }>({
  dataType() {
    return 'ltree';
  },
});

/** İş emri durumları veritabanı enum tipi. */
export const woStatusEnum = pgEnum('wo_status', [
  'STARTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'ENERGIZED',
  'DONE',
  'CANCELLED',
]);

/** İş emri tipleri veritabanı enum tipi. */
export const woTypeEnum = pgEnum('wo_type', [
  'BASIC_WORK',
  'LIGHTING_WORK_ORDER',
  'PLANNED_OUTAGE_WORK_ORDER',
  'UNPLANNED_OUTAGE_WORK_ORDER',
  'WITHOUT_OUTAGE_WORK_ORDER',
]);

/** Kaynak türü veritabanı enum tipi (kullanıcı veya sistem). */
export const recordOriginEnum = pgEnum('record_origin', ['USER', 'SYSTEM']);

/**
 * `network-service`'ten tek seferlik kopyalanan şebeke elemanı read-model'i.
 *
 * ⚠️ **read-model**'dir, foreign key değildir — cross-DB FK yasağı sürüyor. İş emrinin CBS
 * ID doğrulaması ve konumu buradan gelir; `network-service`'e senkron HTTP çağrısı yapılmaz.
 * `outage-service`'teki tablonun aynısıdır; iki servis birbirinin veritabanını okumadığı
 * için kopya kaçınılmazdır.
 */
export const networkComponentsRo = pgTable(
  'network_components_ro',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    type: varchar('type', { length: 64 }).notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    /** Kesici rolü (`TM_FEEDER`, `SERVICE_ENTRY` …) — harita katmanının zoom eşiği bundan türer. */
    breakerRole: varchar('breaker_role', { length: 64 }),
    name: varchar('name', { length: 255 }),
    voltageLevel: varchar('voltage_level', { length: 32 }).notNull(),
    topologyLevel: integer('topology_level').notNull(),
    unitPath: ltree('unit_path').notNull(),
    unitName: varchar('unit_name', { length: 255 }),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_components_ro_type').on(table.type)],
);

/** İş emirleri tablosu. */
export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    status: woStatusEnum('status').notNull().default('STARTED'),
    type: woTypeEnum('type').notNull(),
    cbsId: varchar('cbs_id', { length: 64 }).notNull(),
    // Oluşturma anında read-model'den denormalize edilir: liste ve harita sorguları her
    // satır için read-model'e JOIN atmak zorunda kalmasın diye.
    unitPath: ltree('unit_path').notNull(),
    unitName: varchar('unit_name', { length: 255 }),
    outageId: uuid('outage_id'),
    origin: recordOriginEnum('origin').notNull().default('USER'),
    createdBy: varchar('created_by', { length: 64 }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (table) => [
    index('idx_wo_created_at').on(table.createdAt.desc()),
    index('idx_wo_status').on(table.status),
    index('idx_wo_cbs_id').on(table.cbsId),
    index('idx_wo_type').on(table.type),
    index('idx_wo_outage').on(table.outageId).where(sql`${table.outageId} IS NOT NULL`),
  ],
);

/** İş emri durum değişiklik geçmişi tablosu. */
export const workOrderStatusHistory = pgTable(
  'work_order_status_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    fromStatus: woStatusEnum('from_status'),
    toStatus: woStatusEnum('to_status').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
    actor: varchar('actor', { length: 64 }).notNull(),
    origin: recordOriginEnum('origin').notNull(),
    correlationId: varchar('correlation_id', { length: 64 }),
  },
  (table) => [
    index('idx_wo_history_wo_id').on(table.workOrderId, table.changedAt.desc()),
  ],
);

/** Kafka event idempotency takibi tablosu (çift işlemeyi önler). */
export const processedEvents = pgTable('processed_events', {
  eventId: uuid('event_id').primaryKey(),
  topic: varchar('topic', { length: 128 }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Transactional outbox tablosu. Veritabanı işlemleriyle aynı transaction içinde
 * doldurulur ve olayların Kafka'ya güvenli şekilde aktarılmasını sağlar.
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

