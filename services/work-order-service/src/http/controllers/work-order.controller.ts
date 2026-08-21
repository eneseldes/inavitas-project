import {
  assertInScope,
  ComponentNotFoundError,
  ConflictError,
  NotFoundError,
  parseSort,
  PERMISSIONS,
  scopeFilter,
  toExclusiveUpperBound,
  toPageResult,
  UnauthenticatedError,
  WorkOrderAlreadyActiveError,
  type AuthedRequest,
  type AuthenticatedUser,
  type Permission,
} from '@inavitas/shared';
import type { Response } from 'express';
import { db } from '../../db.ts';
import { workOrders } from '../../db/schema.ts';
import { canTransition } from '../../domain/state-machine.ts';
import {
  enqueueWorkOrderCancelledIfNeededTx,
  enqueueWorkOrderCreatedTx,
  enqueueWorkOrderDoneTx,
} from '../../kafka/producer.ts';
import { notifyWorkOrderChanged } from '../../realtime.ts';
import * as networkComponentRepository from '../../repository/network-component.repository.ts';
import * as workOrderRepository from '../../repository/work-order.repository.ts';
import { SORTABLE_FIELDS, type WorkOrderFilters } from '../../repository/work-order.repository.ts';
import { toWorkOrderDto, toWorkOrderHistoryDto, toWorkOrderMapDto } from '../dto.ts';
import { CreateWorkOrderBody, ListWorkOrdersQuery, PatchWorkOrderBody, WorkOrderMapQuery } from '../schemas.ts';

/** Liste ve harita sorgularının paylaştığı filtre dönüşümü. */
function toFilters(query: ListWorkOrdersQuery | WorkOrderMapQuery, user: AuthenticatedUser): WorkOrderFilters {
  return {
    // 🚨 Kapsam bir filtre DEĞİL, bir süzgeçtir; kullanıcının seçtiği `unitPath` filtresinden
    // bağımsız olarak her sorguya eklenir. Liste ve harita ucu aynı dönüşümden geçer.
    scope: scopeFilter(user, workOrders.unitPath, PERMISSIONS.WORKORDER_READ),
    status: query.status,
    origin: query.origin,
    type: query.type,
    cbsId: query.cbsId,
    unitPath: query.unitPath,
    createdAtFrom: query.createdAtFrom ? new Date(query.createdAtFrom) : undefined,
    createdAtTo: query.createdAtTo ? toExclusiveUpperBound(query.createdAtTo) : undefined,
    hasOutage: query.hasOutage === undefined ? undefined : query.hasOutage === 'true',
  };
}

export async function list(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const query = ListWorkOrdersQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'createdAt', dir: 'desc' });
  const pagination = { page: query.page, pageSize: query.pageSize };

  const { items, total } = await workOrderRepository.list(toFilters(query, req.user), pagination, sort);

  res.json(toPageResult(items.map(toWorkOrderDto), total, query.page, query.pageSize));
}

/**
 * İş emrini kimliğiyle yükler ve kapsam kapısından geçirir.
 *
 * Liste süzgeci bir yetki kanıtı değildir: kimlik doğrudan istenebilir, geçmiş ucu da
 * tekil kimlikle çağrılır. Kapı bu yüzden kaydı okuyan HER yolda tek noktadan geçer.
 */
async function loadInScope(req: AuthedRequest, id: string, permission: Permission) {
  if (!req.user) throw new UnauthenticatedError();

  const row = await workOrderRepository.findById(id);
  if (!row) throw new NotFoundError('İş emri', id);

  assertInScope(req.user, permission, row.unitPath, id);
  return row;
}

export async function getById(req: AuthedRequest, res: Response): Promise<void> {
  const row = await loadInScope(req, req.params.id as string, PERMISSIONS.WORKORDER_READ);
  res.json(toWorkOrderDto(row));
}

export async function create(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();
  const user = req.user;

  const body = CreateWorkOrderBody.parse(req.body);
  const cbsId = body.cbsId;

  // Varlık doğrulaması: read-model'de karşılığı olmayan bir kimlik reddedilir.
  const component = await networkComponentRepository.findById(cbsId);
  if (!component) throw new ComponentNotFoundError(cbsId);

  // Bölgesel yetki kapısı. İş emrinden doğan sistem kesintisi consumer'da yaratılıyor ama
  // iş emriyle AYNI `cbsId` üzerinde doğuyor — yani kapsam kontrolü burada bir kez yapılınca
  // o kesinti de kapsanmış oluyor. Consumer'a ileride ikinci bir kesinti kaynağı eklenirse
  // bu kural orada da tekrarlanmalı.
  assertInScope(user, PERMISSIONS.WORKORDER_WRITE, component.unitPath, cbsId);

  // Mükerrerlik kapısı: aynı elemanda süren bir iş emri varken ikincisi açılamaz.
  //
  // İş emri **enerjisizlik nedeniyle engellenmez** — fiziksel olarak da yanlış olurdu:
  // enerjisi kesik elemana iş emri açmak zaten onarımın kendisidir.
  const activeWorkOrder = await workOrderRepository.findActiveByCbsId(cbsId);
  if (activeWorkOrder) throw new WorkOrderAlreadyActiveError(cbsId, activeWorkOrder.id);

  // İş emri kaydı ve outbox bildirimi aynı transaction içinde yazılır.
  const row = await db.transaction(async (tx) => {
    const created = await workOrderRepository.createTx(
      tx,
      {
        cbsId,
        type: body.type,
        status: body.status ?? 'STARTED',
        origin: 'USER',
        createdBy: user.email,
        unitPath: component.unitPath,
        unitName: component.unitName,
      },
      req.correlationId,
    );

    await enqueueWorkOrderCreatedTx(tx, created, {
      origin: 'USER',
      actor: user.email,
      correlationId: req.correlationId!,
    });
    return created;
  });

  req.log?.info({ workOrderId: row.id, cbsId: row.cbsId, status: row.status }, 'iş emri oluşturuldu');

  await notifyWorkOrderChanged(row, req.log);

  res.status(201).json(toWorkOrderDto(row));
}

export async function patch(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();
  const user = req.user;

  const id = req.params.id as string;
  const body = PatchWorkOrderBody.parse(req.body);
  const current = await loadInScope(req, id, PERMISSIONS.WORKORDER_WRITE);

  if (body.status !== current.status && !canTransition(current.status, body.status)) {
    throw new ConflictError(`${current.status} durumundan ${body.status} durumuna geçilemez`, [
      { field: 'status', issue: 'invalid_transition' },
    ]);
  }

  const updated = await db.transaction(async (tx) => {
    const row = await workOrderRepository.updateWithVersionTx(
      tx,
      current.id,
      body.version,
      {
        status: body.status,
      },
      {
        fromStatus: current.status,
        actor: user.email,
        origin: 'USER',
        correlationId: req.correlationId,
      },
    );

    if (!row) return null;

    if (body.status !== current.status) {
      const opts = { origin: 'USER' as const, actor: user.email, correlationId: req.correlationId! };

      if (row.status === 'DONE') await enqueueWorkOrderDoneTx(tx, row, opts);
      await enqueueWorkOrderCancelledIfNeededTx(tx, current.status, row, opts);
    }

    return row;
  });

  if (!updated) {
    throw new ConflictError('Kayıt başka bir istekle güncellenmiş (version uyuşmazlığı)', [
      { field: 'version', issue: 'stale_version' },
    ]);
  }

  if (body.status !== current.status) {
    req.log?.info({ workOrderId: updated.id, from: current.status, to: body.status }, 'iş emri durumu değişti');
  }

  await notifyWorkOrderChanged(updated, req.log);

  res.json(toWorkOrderDto(updated));
}

export async function getHistory(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  await loadInScope(req, id, PERMISSIONS.WORKORDER_READ);

  const rows = await workOrderRepository.getHistory(id);
  res.json({ items: rows.map(toWorkOrderHistoryDto) });
}


/**
 * `GET /work-orders/map` — harita katmanı için hafif özet.
 *
 * Sayfalama yoktur: harita görünürdeki her iş emrini çizer. Sunucu tarafında sert bir üst
 * sınır vardır; sınıra dayanılırsa `truncated` bayrağı döner.
 */
export async function listForMap(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const query = WorkOrderMapQuery.parse(req.query);
  const items = await workOrderRepository.listForMap(toFilters(query, req.user), query.limit);

  res.json({ items: items.map(toWorkOrderMapDto), truncated: items.length === query.limit });
}
