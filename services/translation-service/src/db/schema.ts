import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Sistemde desteklenen diller. */
export const locales = pgTable(
  'locales',
  {
    code: varchar('code', { length: 10 }).primaryKey(),
    name: varchar('name', { length: 64 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    // DeepL'in bu dil için beklediği kod (örn. 'FI', 'EN-US') — otomatik çeviri
    // için gerekli, boşsa o dilde AI çeviri devre dışı kalır (elle girilir).
    providerCode: varchar('provider_code', { length: 16 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_single_default_locale').on(table.isDefault).where(sql`${table.isDefault}`),
  ],
);

/** Çeviri alan adları (modüller). */
export const translationNamespaces = pgTable('translation_namespaces', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 64 }).notNull().unique(),
  description: text('description'),
});

/** Çeviri anahtarları. */
export const translationKeys = pgTable(
  'translation_keys',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    namespaceId: uuid('namespace_id')
      .notNull()
      .references(() => translationNamespaces.id, { onDelete: 'cascade' }),
    keyName: varchar('key_name', { length: 256 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_namespace_key').on(table.namespaceId, table.keyName),
    index('idx_translation_keys_name').on(table.keyName),
  ],
);

/** Çeviri değerleri — taslak ve yayınlanmış ayrı sütunlarda. */
export const translations = pgTable(
  'translations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    keyId: uuid('key_id')
      .notNull()
      .references(() => translationKeys.id, { onDelete: 'cascade' }),
    localeCode: varchar('locale_code', { length: 10 })
      .notNull()
      .references(() => locales.code, { onDelete: 'cascade' }),
    draftValue: text('draft_value').notNull(),
    publishedValue: text('published_value'),
    updatedBy: varchar('updated_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    unique('uq_key_locale').on(table.keyId, table.localeCode),
    index('idx_translations_bundle').on(table.localeCode, table.keyId),
  ],
);

/** Bundle versiyonları — cache anahtarı ve ETag kaynağı. */
export const bundleVersions = pgTable(
  'bundle_versions',
  {
    localeCode: varchar('locale_code', { length: 10 })
      .notNull()
      .references(() => locales.code, { onDelete: 'cascade' }),
    namespaceId: uuid('namespace_id')
      .notNull()
      .references(() => translationNamespaces.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.localeCode, table.namespaceId] })],
);

/** Değişiklik geçmişi (denetim izi). */
export const translationHistory = pgTable(
  'translation_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    translationId: uuid('translation_id')
      .notNull()
      .references(() => translations.id, { onDelete: 'cascade' }),
    oldValue: text('old_value'),
    newValue: text('new_value').notNull(),
    actor: varchar('actor').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_translation_history_lookup').on(table.translationId, table.changedAt)],
);

/** Kafka Transactional Outbox. */
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
  (table) => [
    index('idx_translation_outbox_pending')
      .on(table.createdAt)
      .where(sql`${table.publishedAt} IS NULL`),
  ],
);
