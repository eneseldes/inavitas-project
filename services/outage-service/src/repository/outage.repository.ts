import type { PaginationQuery, SortOrder } from '@inavitas/shared';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { db, type Tx } from '../db.ts';
import {
  networkComponentsRo,
  outageAffectedCustomers,
  outageImpact,
  outageRelations,
  outages,
  outageStatusHistory,
} from '../db/schema.ts';
import type { CascadeNode } from '../domain/cascade.ts';
import type { OutageStatus } from '../domain/state-machine.ts';

export type OutageRow = typeof outages.$inferSelect;
export type OutageStatusHistoryRow = typeof outageStatusHistory.$inferSelect;
export type OutageImpactRow = typeof outageImpact.$inferSelect;
export type OutageAffectedCustomerRow = typeof outageAffectedCustomers.$inferSelect;
export type OutageRelationRow = typeof outageRelations.$inferSelect;
export type CascadeNodeRow = CascadeNode;

/** Harita katmanının ihtiyaç duyduğu hafif kesinti özeti. */
export interface OutageMapRow {
  id: string;
  cbsId: string;
  status: OutageStatus;
  kind: 'PLANNED' | 'UNPLANNED';
  componentType: string;
  /** Kesici rolü — harita katmanının zoom eşiği bundan türer (kofra kesintisi z16,5'te açılır). */
  breakerRole: string | null;
  unitPath: string;
  unitName: string | null;
  districtName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  affectedCustomerCount: number | null;
  parentOutageId: string | null;
  workOrderId: string | null;
  lat: number;
  lon: number;
}

/** Etki hesabı sonucunun veritabanına yazılacak hâli. */
export interface ApplyImpactInput {
  outageId: string;
  revision: number;
  affectedElementIds: string[];
  affectedElementCount: number;
  affectedCustomerCount: number;
  customers: { customerId: string; unitPath: string; customerType: string | null }[];
  overflowed: boolean;
  radialityViolated: boolean;
}

export interface OutageFilters {
  status?: OutageStatus[];
  cbsId?: string;
  /** İdari birim alt ağacı — `unit_path <@ :unitPath` (ltree GiST indeksi kullanılır). */
  unitPath?: string;
  componentType?: string[];
  /** Etki eşiği: etkilenen abone sayısı ≥ N olan kesintiler. */
  minAffectedCustomers?: number;
  maxAffectedCustomers?: number;
  startedAtFrom?: Date;
  startedAtTo?: Date;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  endedAtFrom?: Date;
  endedAtTo?: Date;
  /** Süre (dakika) — `endedAt - startedAt` üzerinden hesaplanır, dolayısıyla yalnızca kapanmış kesintiler eşleşir. */
  durationMinMinutes?: number;
  durationMaxMinutes?: number;
  origin?: ('USER' | 'SYSTEM')[];
  hasWorkOrder?: boolean;
}

export interface CreateOutageInput {
  cbsId: string;
  startedAt: Date;
  endedAt: Date | null;
  status: OutageStatus;
  kind?: 'PLANNED' | 'UNPLANNED';
  origin: 'USER' | 'SYSTEM';
  createdBy: string;
  workOrderId?: string | null;
  // Oluşturma anında `network_components_ro`'dan denormalize edilen alanlar.
  unitPath: string;
  componentType: string;
  componentName: string | null;
  topologyLevel: number;
}

export interface StatusChangeMeta {
  fromStatus: OutageStatus;
  actor: string;
  origin: 'USER' | 'SYSTEM';
  correlationId?: string;
}

/** Sıralama yapılabilecek alanlar. */
export const SORTABLE_FIELDS = ['createdAt', 'startedAt', 'status', 'cbsId', 'affectedCustomerCount'] as const;

const SORT_COLUMNS = {
  createdAt: outages.createdAt,
  startedAt: outages.startedAt,
  status: outages.status,
  cbsId: outages.cbsId,
  affectedCustomerCount: outages.affectedCustomerCount,
} as const;

function buildConditions(filters: OutageFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.status && filters.status.length > 0) {
    conditions.push(
      filters.status.length === 1 ? eq(outages.status, filters.status[0]!) : inArray(outages.status, filters.status),
    );
  }
  if (filters.origin && filters.origin.length > 0) {
    conditions.push(
      filters.origin.length === 1 ? eq(outages.origin, filters.origin[0]!) : inArray(outages.origin, filters.origin),
    );
  }
  if (filters.cbsId) conditions.push(ilike(outages.cbsId, `${filters.cbsId}%`));
  if (filters.unitPath) conditions.push(sql`${outages.unitPath} <@ ${filters.unitPath}::ltree`);
  if (filters.componentType && filters.componentType.length > 0) {
    conditions.push(
      filters.componentType.length === 1
        ? eq(outages.componentType, filters.componentType[0]!)
        : inArray(outages.componentType, filters.componentType),
    );
  }
  if (filters.minAffectedCustomers !== undefined) {
    conditions.push(gte(outages.affectedCustomerCount, filters.minAffectedCustomers));
  }
  if (filters.maxAffectedCustomers !== undefined) {
    conditions.push(lte(outages.affectedCustomerCount, filters.maxAffectedCustomers));
  }
  if (filters.startedAtFrom) conditions.push(gte(outages.startedAt, filters.startedAtFrom));
  if (filters.startedAtTo) conditions.push(lt(outages.startedAt, filters.startedAtTo));
  if (filters.createdAtFrom) conditions.push(gte(outages.createdAt, filters.createdAtFrom));
  if (filters.createdAtTo) conditions.push(lt(outages.createdAt, filters.createdAtTo));
  if (filters.endedAtFrom) conditions.push(gte(outages.endedAt, filters.endedAtFrom));
  if (filters.endedAtTo) conditions.push(lt(outages.endedAt, filters.endedAtTo));
  if (filters.durationMinMinutes !== undefined) {
    conditions.push(
      sql`ROUND(EXTRACT(EPOCH FROM (${outages.endedAt} - ${outages.startedAt})) / 60) >= ${filters.durationMinMinutes}`,
    );
  }
  if (filters.durationMaxMinutes !== undefined) {
    conditions.push(
      sql`ROUND(EXTRACT(EPOCH FROM (${outages.endedAt} - ${outages.startedAt})) / 60) <= ${filters.durationMaxMinutes}`,
    );
  }
  if (filters.hasWorkOrder === true) conditions.push(isNotNull(outages.workOrderId));
  if (filters.hasWorkOrder === false) conditions.push(isNull(outages.workOrderId));

  return conditions;
}

/** Transaction içinde yeni kesinti kaydı ve durum geçmişi oluşturur. */
export async function createTx(tx: Tx, input: CreateOutageInput, correlationId?: string): Promise<OutageRow> {
  const [row] = await tx.insert(outages).values(input).returning();
  await tx.insert(outageStatusHistory).values({
    outageId: row!.id,
    fromStatus: null,
    toStatus: row!.status,
    actor: input.createdBy,
    origin: input.origin,
    correlationId,
  });
  return row!;
}

/** Kesinti ID ile kayıt arar. */
export async function findById(id: string): Promise<OutageRow | null> {
  const [row] = await db.select().from(outages).where(eq(outages.id, id));
  return row ?? null;
}

/** Kesintileri filtreler, sıralar ve sayfalanmış olarak listeler. */
export async function list(
  filters: OutageFilters,
  pagination: PaginationQuery,
  sort: SortOrder,
): Promise<{ items: OutageRow[]; total: number }> {
  const conditions = buildConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const column = SORT_COLUMNS[sort.field as (typeof SORTABLE_FIELDS)[number]] ?? outages.createdAt;
  const orderBy = sort.dir === 'asc' ? asc(column) : desc(column);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, totalRows] = await Promise.all([
    db.select().from(outages).where(where).orderBy(orderBy).limit(pagination.pageSize).offset(offset),
    db.select({ value: count() }).from(outages).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/** Optimistic locking kontrolü ile kesinti kaydını ve durum geçmişini günceller. */
export async function updateWithVersionTx(
  tx: Tx,
  id: string,
  expectedVersion: number,
  patch: { status?: OutageStatus; endedAt?: Date | null; workOrderId?: string | null },
  meta: StatusChangeMeta,
): Promise<OutageRow | null> {
  const [row] = await tx
    .update(outages)
    .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
    .where(and(eq(outages.id, id), eq(outages.version, expectedVersion)))
    .returning();

  if (!row) return null;

  if (patch.status && patch.status !== meta.fromStatus) {
    await tx.insert(outageStatusHistory).values({
      outageId: id,
      fromStatus: meta.fromStatus,
      toStatus: patch.status,
      actor: meta.actor,
      origin: meta.origin,
      correlationId: meta.correlationId,
    });
  }

  return row;
}

/**
 * Etki hesabı sonucunu yazar: yeni revizyon satırı + kesinti üzerindeki özet alanlar +
 * etkilenen abone read-model'i. Hepsi tek transaction'da, çağıranın idempotency kaydıyla
 * birlikte yürür.
 *
 * Abone satırları revizyon başına tamamen yenilenir (önce sil, sonra yaz): revizyon
 * kümesi daraltabilir de genişletebilir de, artakalan satır bırakmak yetim veri demektir.
 */
export async function applyImpactTx(tx: Tx, input: ApplyImpactInput): Promise<OutageRow | null> {
  await tx
    .insert(outageImpact)
    .values({
      outageId: input.outageId,
      revision: input.revision,
      affectedElementCount: input.affectedElementCount,
      affectedCustomerCount: input.affectedCustomerCount,
      affectedElementIds: input.affectedElementIds,
      overflowed: input.overflowed,
      radialityViolated: input.radialityViolated,
    })
    .onConflictDoNothing({ target: [outageImpact.outageId, outageImpact.revision] });

  await tx.delete(outageAffectedCustomers).where(eq(outageAffectedCustomers.outageId, input.outageId));

  if (input.customers.length > 0) {
    // Tek `INSERT` binlerce satırda parametre sınırına (65.535) dayanabilir; 4 kolon
    // olduğundan 5.000'lik gruplar güvenli aralıkta kalır.
    const CHUNK = 5_000;
    for (let i = 0; i < input.customers.length; i += CHUNK) {
      await tx
        .insert(outageAffectedCustomers)
        .values(
          input.customers.slice(i, i + CHUNK).map((c) => ({
            outageId: input.outageId,
            customerId: c.customerId,
            unitPath: c.unitPath,
            customerType: c.customerType,
          })),
        )
        .onConflictDoNothing();
    }
  }

  const [row] = await tx
    .update(outages)
    .set({
      affectedCustomerCount: input.affectedCustomerCount,
      impactStatus: input.radialityViolated ? 'UNAVAILABLE' : 'CALCULATED',
      updatedAt: new Date(),
    })
    .where(eq(outages.id, input.outageId))
    .returning();

  return row ?? null;
}

/** Kesintinin en güncel etki revizyonunu döner. */
export async function findLatestImpact(outageId: string): Promise<OutageImpactRow | null> {
  const [row] = await db
    .select()
    .from(outageImpact)
    .where(eq(outageImpact.outageId, outageId))
    .orderBy(desc(outageImpact.revision))
    .limit(1);

  return row ?? null;
}

/** Kesintinin etkilediği aboneleri sayfalanmış olarak döner (PII yoktur). */
export async function listAffectedCustomers(
  outageId: string,
  pagination: PaginationQuery,
): Promise<{ items: OutageAffectedCustomerRow[]; total: number }> {
  const where = eq(outageAffectedCustomers.outageId, outageId);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(outageAffectedCustomers)
      .where(where)
      .orderBy(asc(outageAffectedCustomers.customerId))
      .limit(pagination.pageSize)
      .offset(offset),
    db.select({ value: count() }).from(outageAffectedCustomers).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/**
 * Verilen elemanı etki kümesinde taşıyan **aktif** kesintileri döner — kapsayan kesinti
 * adayları. Etki kümesi en dar olan (en az eleman etkileyen) en yakın üsttür, o yüzden
 * artan sırada dönülür.
 */
export async function findContainingOutages(cbsId: string, excludeOutageId: string): Promise<OutageRow[]> {
  return db
    .select({ outage: outages })
    .from(outages)
    .innerJoin(outageImpact, eq(outageImpact.outageId, outages.id))
    .where(
      and(
        eq(outages.status, 'STARTED'),
        sql`${outages.id} <> ${excludeOutageId}::uuid`,
        sql`${outageImpact.affectedElementIds} @> ${JSON.stringify([cbsId])}::jsonb`,
      ),
    )
    .orderBy(asc(outageImpact.affectedElementCount))
    .then((rows) => rows.map((r) => r.outage));
}

/**
 * Verilen etki kümesinin içinde kalan, henüz bir üste bağlanmamış **aktif** kesintileri
 * döner — yeni açılan üst kesintinin kapsayacağı alt kesintiler.
 */
export async function findContainedOutages(elementIds: string[], excludeOutageId: string): Promise<OutageRow[]> {
  if (elementIds.length === 0) return [];

  return db
    .select()
    .from(outages)
    .where(
      and(
        eq(outages.status, 'STARTED'),
        isNull(outages.parentOutageId),
        sql`${outages.id} <> ${excludeOutageId}::uuid`,
        inArray(outages.cbsId, elementIds),
      ),
    );
}

/** Kaskad zinciri taraması için gereken asgari alanları getirir (döngü koruması). */
export async function findCascadeNodes(ids: string[]): Promise<CascadeNodeRow[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: outages.id, parentOutageId: outages.parentOutageId })
    .from(outages)
    .where(inArray(outages.id, ids));
}

/** Tüm kesintilerin kaskad zinciri düğümlerini getirir — zincir taraması bunun üzerinde yürür. */
export async function findAllCascadeNodes(): Promise<CascadeNodeRow[]> {
  return db
    .select({ id: outages.id, parentOutageId: outages.parentOutageId })
    .from(outages)
    .where(isNotNull(outages.parentOutageId));
}

/** Kaskad bağını yazar: hem `outages.parent_outage_id` hem `outage_relations` satırı. */
export async function linkCascadeTx(
  tx: Tx,
  parentOutageId: string,
  childOutageId: string,
  relationType: 'CONTAINS' | 'SUPERSEDES',
): Promise<boolean> {
  const [row] = await tx
    .update(outages)
    .set({ parentOutageId, version: sql`${outages.version} + 1`, updatedAt: new Date() })
    .where(and(eq(outages.id, childOutageId), isNull(outages.parentOutageId)))
    .returning({ id: outages.id });

  if (!row) return false;

  await tx
    .insert(outageRelations)
    .values({ parentOutageId, childOutageId, relationType })
    .onConflictDoNothing({ target: [outageRelations.parentOutageId, outageRelations.childOutageId] });

  return true;
}

/** Bir üst kesintiye bağlı, hâlâ süren alt kesintileri döner (otomatik çözülme için). */
export async function findActiveChildren(parentOutageId: string): Promise<OutageRow[]> {
  return db
    .select()
    .from(outages)
    .where(and(eq(outages.parentOutageId, parentOutageId), eq(outages.status, 'STARTED')));
}

/** Kesintinin kaskad ilişkilerini (üstü ve altları) döner. */
export async function findRelations(outageId: string): Promise<OutageRelationRow[]> {
  return db
    .select()
    .from(outageRelations)
    .where(or(eq(outageRelations.parentOutageId, outageId), eq(outageRelations.childOutageId, outageId)))
    .orderBy(desc(outageRelations.createdAt));
}

/**
 * Harita katmanı için hafif özet: yalnız çizim ve rozet için gereken alanlar. Koordinat
 * `network_components_ro` read-model'inden gelir — kesinti satırında koordinat kopyası
 * tutulmaz, model değişmediği için read-model tek doğru kaynaktır.
 */
export async function listForMap(filters: OutageFilters, limit: number): Promise<OutageMapRow[]> {
  const conditions = buildConditions(filters);

  return db
    .select({
      id: outages.id,
      cbsId: outages.cbsId,
      status: outages.status,
      kind: outages.kind,
      componentType: outages.componentType,
      breakerRole: networkComponentsRo.breakerRole,
      unitPath: outages.unitPath,
      unitName: networkComponentsRo.unitName,
      districtName: networkComponentsRo.districtName,
      startedAt: outages.startedAt,
      endedAt: outages.endedAt,
      affectedCustomerCount: outages.affectedCustomerCount,
      parentOutageId: outages.parentOutageId,
      workOrderId: outages.workOrderId,
      lat: networkComponentsRo.lat,
      lon: networkComponentsRo.lon,
    })
    .from(outages)
    .innerJoin(networkComponentsRo, eq(networkComponentsRo.id, outages.cbsId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(outages.startedAt))
    .limit(limit);
}

/** Kesintiye iş emri bağlantısı atar (workOrderId günceller). */
export async function linkWorkOrderTx(tx: Tx, outageId: string, workOrderId: string): Promise<OutageRow | null> {
  const [row] = await tx
    .update(outages)
    .set({ workOrderId, version: sql`${outages.version} + 1`, updatedAt: new Date() })
    .where(eq(outages.id, outageId))
    .returning();

  return row ?? null;
}

/** Kesintinin durum değişiklik geçmişini getirir. */
export async function getHistory(outageId: string): Promise<OutageStatusHistoryRow[]> {
  return db
    .select()
    .from(outageStatusHistory)
    .where(eq(outageStatusHistory.outageId, outageId))
    .orderBy(desc(outageStatusHistory.changedAt));
}

