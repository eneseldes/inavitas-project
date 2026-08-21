import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * PostgreSQL `ltree` tipi — idari birim yolu (`TR.06.012.0137`). `network_db`'deki ile
 * birebir aynı tiptir; bölge sorguları (`unit_path <@ 'TR.06'`) JOIN'siz cevaplanır.
 */
export const ltree = customType<{ data: string }>({
  dataType() {
    return 'ltree';
  },
});

/** Kesinti durumları veritabanı enum tipi. */
export const outageStatusEnum = pgEnum('outage_status', ['STARTED', 'ENERGIZED', 'ARCHIVED', 'CANCELLED']);

/** Kaynak türü veritabanı enum tipi (kullanıcı veya sistem). */
export const recordOriginEnum = pgEnum('record_origin', ['USER', 'SYSTEM']);

/** Kesinti türü: önceden planlanmış çalışma mı, arıza mı. */
export const outageKindEnum = pgEnum('outage_kind', ['PLANNED', 'UNPLANNED']);

/**
 * Etki hesabının durumu. Kesinti açıldığında `PENDING` yazılır; `network-service` grafı
 * gezip `outage.impact.calculated` olayını yayınlayınca `CALCULATED` olur. Radyallik
 * varsayımı bozulduysa (kapalı ring üzerinden alternatif besleme) `UNAVAILABLE` kalır.
 */
export const outageImpactStatusEnum = pgEnum('outage_impact_status', ['PENDING', 'CALCULATED', 'UNAVAILABLE']);

/** Kaskad ilişki türü: kapsama mı, üst elemana taşınma mı. */
export const outageRelationTypeEnum = pgEnum('outage_relation_type', ['CONTAINS', 'SUPERSEDES']);

/**
 * `network-service`'ten tek seferlik kopyalanan şebeke elemanı read-model'i.
 *
 * ⚠️ Bu bir **read-model**'dir, foreign key değildir — her servisin kendi veritabanı vardır,
 * cross-DB FK yoktur. Kesintinin CBS ID doğrulaması ve konumu buradan gelir;
 * `network-service`'e senkron HTTP çağrısı yapılmaz. Model değişmediği için (envanter
 * yönetimi kapsam dışı) tablo bir kez seed edilir ve olayla güncellenmez.
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
    /** Mahalle adı — her kesinti satırında yolu ada çevirmek için denormalize edilir. */
    unitName: varchar('unit_name', { length: 255 }),
    /** İlçe adı — haritadaki alan sonuç listesi mahalleyle birlikte bunu da gösterir. */
    districtName: varchar('district_name', { length: 255 }),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_components_ro_type').on(table.type)],
);

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
    kind: outageKindEnum('kind').notNull().default('UNPLANNED'),
    workOrderId: uuid('work_order_id'),
    /** Kesintinin bağlandığı şebeke elemanı — `network_components_ro`'da karşılığı olmalıdır. */
    cbsId: varchar('cbs_id', { length: 64 }).notNull(),
    // Aşağıdaki dört alan oluşturma anında read-model'den denormalize edilir: liste ve
    // harita sorguları her satır için read-model'e JOIN atmak zorunda kalmasın diye.
    unitPath: ltree('unit_path').notNull(),
    componentType: varchar('component_type', { length: 64 }).notNull(),
    componentName: varchar('component_name', { length: 255 }),
    topologyLevel: integer('topology_level').notNull(),
    /** Son hesaplanan etki — `outage_impact`'in en güncel revizyonunun özeti. */
    affectedCustomerCount: integer('affected_customer_count'),
    impactStatus: outageImpactStatusEnum('impact_status').notNull().default('PENDING'),
    /** Bu kesintiyi kapsayan üst kesinti — müşteri-dakika yalnız kapsayanda sayılır. */
    parentOutageId: uuid('parent_outage_id').references((): AnyPgColumn => outages.id, { onDelete: 'set null' }),
    origin: recordOriginEnum('origin').notNull().default('USER'),
    createdBy: varchar('created_by', { length: 64 }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (table) => [
    index('idx_outages_created_at').on(table.createdAt.desc()),
    index('idx_outages_status').on(table.status),
    index('idx_outages_cbs_id').on(table.cbsId),
    index('idx_outages_component_type').on(table.componentType),
    index('idx_outages_parent').on(table.parentOutageId).where(sql`${table.parentOutageId} IS NOT NULL`),
    index('idx_outages_work_order').on(table.workOrderId).where(sql`${table.workOrderId} IS NOT NULL`),
    index('idx_outages_active')
      .on(table.cbsId, table.startedAt.desc())
      .where(sql`${table.status} = 'STARTED'`),
    check('chk_ended_after_started', sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
    check('chk_parent_not_self', sql`${table.parentOutageId} IS NULL OR ${table.parentOutageId} <> ${table.id}`),
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

/**
 * Etki anlık görüntüsü (snapshot). Ekle-only'dur: her hesap yeni bir revizyon satırıdır,
 * eskisini ezmez. Bugün her kesintinin tek bir revizyonu (`1`) vardır — etki kesinti
 * açılırken bir kez hesaplanır; yer ileride revizyon yazılmak istenirse hazır durur.
 */
export const outageImpact = pgTable(
  'outage_impact',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    outageId: uuid('outage_id')
      .notNull()
      .references(() => outages.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    affectedElementCount: integer('affected_element_count').notNull(),
    affectedCustomerCount: integer('affected_customer_count').notNull(),
    /** Etkilenen eleman kimlikleri — kapsama (`@>`) sorgusuyla kaskad tespiti buradan yapılır. */
    affectedElementIds: jsonb('affected_element_ids').notNull().$type<string[]>(),
    /** Kimlik listeleri üst sınırı aştı: sayılar doğru, listeler kırpılmış. */
    overflowed: boolean('overflowed').notNull().default(false),
    /** Radyallik varsayımı bozuldu — etki kümesi güvenilir değil. */
    radialityViolated: boolean('radiality_violated').notNull().default(false),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_outage_impact_revision').on(table.outageId, table.revision),
    index('idx_outage_impact_outage').on(table.outageId, table.revision.desc()),
    /**
     * Kapsama (`@>`) sorgusunun indeksi — kesinti açma kapısı her istekte bunu çalıştırır
     * (bkz. outage.repository.ts `findContainingOutages`). İndeks olmadan sorgu, süren her
     * kesintinin on binlerce elemanlı jsonb dizisini tek tek tarıyordu.
     *
     * `jsonb_path_ops` seçildi çünkü tek ihtiyacımız kapsama operatörü: varsayılan
     * `jsonb_ops`'a göre belirgin şekilde küçük ve `@>` üstünde daha hızlıdır.
     */
    index('idx_outage_impact_elements').using('gin', sql`${table.affectedElementIds} jsonb_path_ops`),
  ],
);

/**
 * Kesintinin etkilediği abonelerin read-model'i — "Etkilenen Aboneler" sekmesini besler.
 *
 * ⚠️ **PII içermez** (`wiring_id`/`contract_id` yoktur): `network-service`'in zaten PII'sız
 * döndürdüğü alanların kopyasıdır. Kaynak-of-truth yine network grafıdır; kesinti silinince
 * bu satırlar da gider (yetim veri bırakılmaz).
 */
export const outageAffectedCustomers = pgTable(
  'outage_affected_customers',
  {
    outageId: uuid('outage_id')
      .notNull()
      .references(() => outages.id, { onDelete: 'cascade' }),
    customerId: varchar('customer_id', { length: 64 }).notNull(),
    unitPath: ltree('unit_path').notNull(),
    customerType: varchar('customer_type', { length: 64 }),
  },
  (table) => [primaryKey({ columns: [table.outageId, table.customerId] })],
);

/**
 * Kesintiler arası kaskad ilişkileri. `outages.parent_outage_id` en güncel bağı taşır;
 * bu tablo ilişkinin **neden** kurulduğunu (kapsama mı, yükselme mi) ve ne zaman
 * kurulduğunu saklar.
 */
export const outageRelations = pgTable(
  'outage_relations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    parentOutageId: uuid('parent_outage_id')
      .notNull()
      .references(() => outages.id, { onDelete: 'cascade' }),
    childOutageId: uuid('child_outage_id')
      .notNull()
      .references(() => outages.id, { onDelete: 'cascade' }),
    relationType: outageRelationTypeEnum('relation_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_outage_relation').on(table.parentOutageId, table.childOutageId),
    index('idx_outage_relations_child').on(table.childOutageId),
    check('chk_relation_not_self', sql`${table.parentOutageId} <> ${table.childOutageId}`),
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
