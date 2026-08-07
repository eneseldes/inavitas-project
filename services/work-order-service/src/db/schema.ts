import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

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

/** İş emirleri tablosu. */
export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    status: woStatusEnum('status').notNull().default('STARTED'),
    type: woTypeEnum('type').notNull(),
    gisId: varchar('gis_id', { length: 64 }).notNull(),
    outageId: uuid('outage_id'),
    origin: recordOriginEnum('origin').notNull().default('USER'),
    createdBy: varchar('created_by', { length: 64 }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (table) => [
    index('idx_wo_created_at').on(table.createdAt.desc()),
    index('idx_wo_status').on(table.status),
    index('idx_wo_gis_id').on(table.gisId),
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

