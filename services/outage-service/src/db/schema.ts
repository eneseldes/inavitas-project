import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * outage-service şeması — SRS 1.5 "Veritabanı: outage_db".
 *
 * `workOrderId` BİLEREK `.references()` KULLANMIYOR: karşı taraf başka bir
 * veritabanında (`work_order_db`), hatta Drizzle'ın hiç bağlanamadığı bir
 * DB kullanıcısının arkasında. `.references()` yazsaydık migration bir FK
 * constraint'i aynı veritabanında arar, bulamaz ve migration uygulanamaz
 * (roadmap Faz 2 tuzağı). Bu yüzden yalnızca skaler bir `uuid` sütunu.
 */

export const outageStatusEnum = pgEnum('outage_status', ['STARTED', 'ENERGIZED', 'ARCHIVED', 'CANCELLED']);

/**
 * `record_origin` tipi burada VE work-order-service'te ayrı ayrı tanımlanır.
 * Kod tekrarı değil — bağımsız veritabanlarındaki aynı isimli tipler
 * birbirinden habersizdir. Tek ortak tanım packages/contracts'taki TS tipi.
 */
export const recordOriginEnum = pgEnum('record_origin', ['USER', 'SYSTEM']);

export const outages = pgTable(
  'outages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    status: outageStatusEnum('status').notNull().default('STARTED'),
    workOrderId: uuid('work_order_id'), // başka DB'ye referans, FK YOK
    gisId: varchar('gis_id', { length: 64 }).notNull(),
    origin: recordOriginEnum('origin').notNull().default('USER'),
    createdBy: varchar('created_by', { length: 64 }).notNull(), // user id veya 'SYSTEM'
    version: integer('version').notNull().default(0), // optimistic locking
  },
  (table) => [
    index('idx_outages_created_at').on(table.createdAt.desc()),
    index('idx_outages_status').on(table.status),
    index('idx_outages_gis_id').on(table.gisId),
    index('idx_outages_work_order').on(table.workOrderId).where(sql`${table.workOrderId} IS NOT NULL`),
    // Aktif kesinti sorgusu için partial index.
    index('idx_outages_active')
      .on(table.gisId, table.startedAt.desc())
      .where(sql`${table.status} = 'STARTED'`),
    check('chk_ended_after_started', sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
  ],
);
