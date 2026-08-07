import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** Kesinti durumları veritabanı enum tipi. */
export const outageStatusEnum = pgEnum('outage_status', ['STARTED', 'ENERGIZED', 'ARCHIVED', 'CANCELLED']);

/** Kaynak türü veritabanı enum tipi (kullanıcı veya sistem). */
export const recordOriginEnum = pgEnum('record_origin', ['USER', 'SYSTEM']);

/** Kesintiler tablosu. */
export const outages = pgTable(
  'outages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    status: outageStatusEnum('status').notNull().default('STARTED'),
    workOrderId: uuid('work_order_id'),
    gisId: varchar('gis_id', { length: 64 }).notNull(),
    origin: recordOriginEnum('origin').notNull().default('USER'),
    createdBy: varchar('created_by', { length: 64 }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (table) => [
    index('idx_outages_created_at').on(table.createdAt.desc()),
    index('idx_outages_status').on(table.status),
    index('idx_outages_gis_id').on(table.gisId),
    index('idx_outages_work_order').on(table.workOrderId).where(sql`${table.workOrderId} IS NOT NULL`),
    index('idx_outages_active')
      .on(table.gisId, table.startedAt.desc())
      .where(sql`${table.status} = 'STARTED'`),
    check('chk_ended_after_started', sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
  ],
);

/** Kesinti durum değişiklik geçmişi tablosu. */
export const outageStatusHistory = pgTable(
  'outage_status_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    outageId: uuid('outage_id')
      .notNull()
      .references(() => outages.id, { onDelete: 'cascade' }),
    fromStatus: outageStatusEnum('from_status'),
    toStatus: outageStatusEnum('to_status').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
    actor: varchar('actor', { length: 64 }).notNull(),
    origin: recordOriginEnum('origin').notNull(),
    correlationId: varchar('correlation_id', { length: 64 }),
  },
  (table) => [
    index('idx_outage_history_outage_id').on(table.outageId, table.changedAt.desc()),
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

