import {
  assertHighImpactAllowed,
  ComponentDeEnergizedError,
  ComponentNotFoundError,
  ConflictError,
  NotFoundError,
  OutageAlreadyActiveError,
  PaginationQuery,
  parseSort,
  toExclusiveUpperBound,
  toPageResult,
  UnauthenticatedError,
  type AuthedRequest,
} from '@inavitas/shared';
import type { Response } from 'express';
import { db } from '../../db.ts';
import { canTransition, type OutageStatus } from '../../domain/state-machine.ts';
import {
  enqueueOutageCancelledIfNeededTx,
  enqueueOutageCreatedTx,
  enqueueOutageEnergizedIfNeededTx,
} from '../../kafka/producer.ts';
import { notifyOutageChanged } from '../../realtime.ts';
import * as networkComponentRepository from '../../repository/network-component.repository.ts';
import * as outageRepository from '../../repository/outage.repository.ts';
import { SORTABLE_FIELDS, type OutageFilters } from '../../repository/outage.repository.ts';
import {
  toAffectedCustomerDto,
  toOutageDto,
  toOutageHistoryDto,
  toOutageImpactDto,
  toOutageMapDto,
  toOutageRelationDto,
} from '../dto.ts';
import { CreateOutageBody, ListOutagesQuery, OutageMapQuery, PatchOutageBody } from '../schemas.ts';

/** Liste ve harita sorgularının paylaştığı filtre dönüşümü. */
function toFilters(query: ListOutagesQuery | OutageMapQuery): OutageFilters {
  return {
    status: query.status,
    origin: query.origin,
    cbsId: query.cbsId,
    unitPath: query.unitPath,
    componentType: query.componentType,
    minAffectedCustomers: query.minAffectedCustomers,
    maxAffectedCustomers: query.maxAffectedCustomers,
    startedAtFrom: query.startedAtFrom ? new Date(query.startedAtFrom) : undefined,
    startedAtTo: query.startedAtTo ? toExclusiveUpperBound(query.startedAtTo) : undefined,
    createdAtFrom: query.createdAtFrom ? new Date(query.createdAtFrom) : undefined,
    createdAtTo: query.createdAtTo ? toExclusiveUpperBound(query.createdAtTo) : undefined,
    endedAtFrom: query.endedAtFrom ? new Date(query.endedAtFrom) : undefined,
    endedAtTo: query.endedAtTo ? toExclusiveUpperBound(query.endedAtTo) : undefined,
    durationMinMinutes: query.durationMinMinutes,
    durationMaxMinutes: query.durationMaxMinutes,
    hasWorkOrder: query.hasWorkOrder === undefined ? undefined : query.hasWorkOrder === 'true',
  };
}

export async function list(req: AuthedRequest, res: Response): Promise<void> {
  const query = ListOutagesQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'createdAt', dir: 'desc' });
  const pagination = { page: query.page, pageSize: query.pageSize };

  const { items, total } = await outageRepository.list(toFilters(query), pagination, sort);

  res.json(toPageResult(items.map(toOutageDto), total, query.page, query.pageSize));
}

export async function getById(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const row = await outageRepository.findById(id);
  if (!row) throw new NotFoundError('Kesinti', id);

  res.json(toOutageDto(row));
}

/**
 * Kesinti açılabilir mi — sunucu tarafı kapı.
 *
 * İki bilinen sınır **kabul edilmiştir**:
 * 1. Etki kümesi `IMPACT_ID_LIMIT` ile kırpılır; kırpılmış bir kümede kapsama sorgusu bazı
 *    elemanları kaçırabilir. Kaçarsa ikinci kesinti açılır ve kaskad motoru onu zaten üst
 *    kesintiye **bağlar** — sonuç yanlış değil, sadece daha az sıkı.
 * 2. Etki asenkrondur (`impactStatus: 'PENDING'`); kesinti açıldıktan ~300 ms sonrasına kadar
 *    alt elemana ikinci kesinti açılabilir. Yine kaskad ağı yakalar. Emniyet ağı budur, kapı değil.
 */
async function assertOutageAllowed(cbsId: string): Promise<void> {
  const activeOnSelf = await outageRepository.findActiveByCbsId(cbsId);
  if (activeOnSelf) throw new OutageAlreadyActiveError(cbsId, activeOnSelf.id);

  const containing = await outageRepository.findContainingOutages(cbsId);
  if (containing.length > 0) throw new ComponentDeEnergizedError(cbsId, containing[0]!.id);
}

export async function create(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const body = CreateOutageBody.parse(req.body);
  const cbsId = body.cbsId;

  // Kesintinin varlık doğrulaması burada: read-model'de karşılığı olmayan bir kimlik
  // reddedilir. Eskiden bu alanın tek doğrulaması uzunluktu ve "asdasd" kabul ediliyordu.
  const component = await networkComponentRepository.findById(cbsId);
  if (!component) throw new ComponentNotFoundError(cbsId);

  // Yüksek etkili kesinti (fider kesicisi ve üstü) ek izin ister. Harita üzerindeki etki
  // önizlemesi kullanıcıya sayıyı gösterir ama karar burada verilir — önizleme atlanabilir
  // ya da arada eskiyebilir; istemcinin gösterdiği sayıya güvenilmez.
  assertHighImpactAllowed(req.user, cbsId, component.topologyLevel);

  // Enerjisizlik ve mükerrerlik kapıları. Karar sunucudadır; istemci onu yalnız erkenden ve
  // anlaşılır biçimde gösterir. Sıra önemli: "kendi üzerinde kesinti var" daha spesifik bir
  // cevaptır, önce o denenir.
  await assertOutageAllowed(cbsId);

  const status: OutageStatus = body.endedAt ? 'ENERGIZED' : (body.status ?? 'STARTED');
  const user = req.user;

  // Kesinti kaydı ve outbox bildirimi aynı transaction içinde yazılır.
  const row = await db.transaction(async (tx) => {
    const created = await outageRepository.createTx(
      tx,
      {
        cbsId,
        startedAt: new Date(body.startedAt),
        endedAt: body.endedAt ? new Date(body.endedAt) : null,
        status,
        kind: body.kind,
        origin: 'USER',
        createdBy: user.email,
        // Konum ve idari yol read-model'den denormalize edilir; liste/harita sorguları
        // her satır için read-model'e JOIN atmak zorunda kalmasın diye.
        unitPath: component.unitPath,
        componentType: component.type,
        componentName: component.name,
        topologyLevel: component.topologyLevel,
      },
      req.correlationId,
    );

    await enqueueOutageCreatedTx(tx, created, {
      origin: 'USER',
      actor: user.email,
      correlationId: req.correlationId!,
    });
    return created;
  });

  req.log?.info({ outageId: row.id, cbsId: row.cbsId, status: row.status }, 'kesinti oluşturuldu');

  await notifyOutageChanged(row, req.log);

  res.status(201).json(toOutageDto(row));
}

export async function patch(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();
  const user = req.user;

  const id = req.params.id as string;
  const body = PatchOutageBody.parse(req.body);
  const current = await outageRepository.findById(id);

  if (!current) throw new NotFoundError('Kesinti', id);

  if (current.status === 'ARCHIVED' || current.status === 'CANCELLED') {
    throw new ConflictError(`${current.status} durumundaki kesinti kilitlidir, verisi değiştirilemez`, [
      { field: 'status', issue: 'outage_locked' },
    ]);
  }

  const nextStatus: OutageStatus = body.status ?? (body.endedAt && !current.endedAt ? 'ENERGIZED' : current.status);

  if (nextStatus !== current.status && !canTransition(current.status, nextStatus)) {
    throw new ConflictError(`${current.status} durumundan ${nextStatus} durumuna geçilemez`, [
      { field: 'status', issue: 'invalid_transition' },
    ]);
  }

  const result = await db.transaction(async (tx) => {
    const row = await outageRepository.updateWithVersionTx(
      tx,
      current.id,
      body.version,
      {
        status: nextStatus,
        endedAt: body.endedAt ? new Date(body.endedAt) : current.endedAt,
      },
      {
        fromStatus: current.status,
        actor: user.email,
        origin: 'USER',
        correlationId: req.correlationId,
      },
    );

    if (!row) return null;

    let detachedChildren: typeof row[] = [];

    if (nextStatus !== current.status) {
      const opts = { origin: 'USER' as const, actor: user.email, correlationId: req.correlationId! };

      await enqueueOutageEnergizedIfNeededTx(tx, current.status, row, opts);
      await enqueueOutageCancelledIfNeededTx(tx, current.status, row, opts);

      if (nextStatus === 'CANCELLED') {
        // İptal edilen üstün çocukları kopartılır, yetim abone satırları temizlenir.
        detachedChildren = await outageRepository.detachChildrenTx(tx, row.id);
        await outageRepository.clearAffectedCustomersTx(tx, row.id);
      }
    }

    return { row, detachedChildren };
  });

  if (!result) {
    throw new ConflictError('Kayıt başka bir istekle güncellenmiş (version uyuşmazlığı)', [
      { field: 'version', issue: 'stale_version' },
    ]);
  }

  const { row: updated, detachedChildren } = result;

  if (nextStatus !== current.status) {
    req.log?.info({ outageId: updated.id, from: current.status, to: nextStatus }, 'kesinti durumu değişti');
  }

  if (detachedChildren.length > 0) {
    req.log?.info(
      { outageId: updated.id, detachedCount: detachedChildren.length },
      'iptal edilen kesintinin kaskad çocukları kopartıldı',
    );
  }

  await notifyOutageChanged(updated, req.log);
  for (const child of detachedChildren) await notifyOutageChanged(child, req.log);

  res.json(toOutageDto(updated));
}

export async function getHistory(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const current = await outageRepository.findById(id);
  if (!current) throw new NotFoundError('Kesinti', id);

  const rows = await outageRepository.getHistory(id);
  res.json({ items: rows.map(toOutageHistoryDto) });
}


/**
 * `GET /outages/:id/impact` — en güncel etki anlık görüntüsü.
 * Etki henüz hesaplanmadıysa (olay yolda) 200 ve `null` döner; bu bir hata değil,
 * geçici bir durumdur (`impactStatus: 'PENDING'`).
 */
export async function getImpact(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const outage = await outageRepository.findById(id);
  if (!outage) throw new NotFoundError('Kesinti', id);

  const impact = await outageRepository.findLatestImpact(id);

  res.json({
    impactStatus: outage.impactStatus,
    impact: impact ? toOutageImpactDto(impact) : null,
  });
}

/** `GET /outages/:id/cascade` — kesintinin üstü ve kapsadığı alt kesintiler. */
export async function getCascade(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const outage = await outageRepository.findById(id);
  if (!outage) throw new NotFoundError('Kesinti', id);

  const relations = await outageRepository.findRelations(id);

  res.json({
    outageId: id,
    parentOutageId: outage.parentOutageId,
    relations: relations.map(toOutageRelationDto),
  });
}

/** `GET /outages/:id/affected-customers` — sayfalı, **PII'sız** etkilenen abone listesi. */
export async function getAffectedCustomers(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const outage = await outageRepository.findById(id);
  if (!outage) throw new NotFoundError('Kesinti', id);

  const pagination = PaginationQuery.parse(req.query);
  const { items, total } = await outageRepository.listAffectedCustomers(id, pagination);

  res.json(toPageResult(items.map(toAffectedCustomerDto), total, pagination.page, pagination.pageSize));
}

/**
 * `GET /outages/map` — harita katmanı için hafif özet.
 *
 * Sayfalama yoktur: harita görünürdeki her kesintiyi çizer. Bunun yerine sunucu tarafında
 * sert bir üst sınır vardır; sınıra dayanılırsa `truncated` bayrağı döner ve istemci
 * kullanıcıyı filtre daraltmaya yönlendirir.
 */
export async function listForMap(req: AuthedRequest, res: Response): Promise<void> {
  const query = OutageMapQuery.parse(req.query);
  const items = await outageRepository.listForMap(toFilters(query), query.limit);

  res.json({ items: items.map(toOutageMapDto), truncated: items.length === query.limit });
}
