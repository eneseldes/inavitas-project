import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * work-order-service şeması — SRS 1.5 "Veritabanı: work_order_db".
 *
 * `outageId` BİLEREK `.references()` KULLANMIYOR — bkz. outage-service/src/db/schema.ts
 * içindeki `workOrderId` için aynı gerekçe: karşı taraf başka bir veritabanında.
 */

export const woStatusEnum = pgEnum('wo_status', [
  'STARTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'ENERGIZED',
  'DONE',
  'CANCELLED',
]);

export const woTypeEnum = pgEnum('wo_type', [
  'BASIC_WORK',
  'LIGHTING_WORK_ORDER',
  'PLANNED_OUTAGE_WORK_ORDER',
  'UNPLANNED_OUTAGE_WORK_ORDER',
  'WITHOUT_OUTAGE_WORK_ORDER',
]);

/** outage-service'teki aynı isimli tip gibi, bu da BAĞIMSIZ bir tanım (ayrı veritabanı). */
export const recordOriginEnum = pgEnum('record_origin', ['USER', 'SYSTEM']);

export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    status: woStatusEnum('status').notNull().default('STARTED'),
    type: woTypeEnum('type').notNull(),
    gisId: varchar('gis_id', { length: 64 }).notNull(),
    outageId: uuid('outage_id'), // başka DB'ye referans, FK YOK
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
