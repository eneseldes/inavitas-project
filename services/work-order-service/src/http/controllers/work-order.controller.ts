import {
  assertHighImpactAllowed,
  ComponentNotFoundError,
  ConflictError,
  NotFoundError,
  parseSort,
  toExclusiveUpperBound,
  toPageResult,
  UnauthenticatedError,
  WorkOrderAlreadyActiveError,
  type AuthedRequest,
} from '@inavitas/shared';
import type { Response } from 'express';
import { db } from '../../db.ts';
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
function toFilters(query: ListWorkOrdersQuery | WorkOrderMapQuery): WorkOrderFilters {
  return {
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
  const query = ListWorkOrdersQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'createdAt', dir: 'desc' });
  const pagination = { page: query.page, pageSize: query.pageSize };

  const { items, total } = await workOrderRepository.list(toFilters(query), pagination, sort);

  res.json(toPageResult(items.map(toWorkOrderDto), total, query.page, query.pageSize));
}

export async function getById(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const row = await workOrderRepository.findById(id);
  if (!row) throw new NotFoundError('İş emri', id);

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

  // Her iş emri, outage-service consumer'ında tipten bağımsız otomatik bir kesinti kaydı
  // doğurur (bkz. outage-service/kafka/consumers.ts handleWorkOrderCreated); bu yüzden ek izin
  // tüm türlerde aranır, yalnız "kesinti türü" olanlarda değil.
  assertHighImpactAllowed(user, cbsId, component.topologyLevel);

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
  const current = await workOrderRepository.findById(id);

  if (!current) throw new NotFoundError('İş emri', id);

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
  const current = await workOrderRepository.findById(id);
  if (!current) throw new NotFoundError('İş emri', id);

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
  const query = WorkOrderMapQuery.parse(req.query);
  const items = await workOrderRepository.listForMap(toFilters(query), query.limit);

  res.json({ items: items.map(toWorkOrderMapDto), truncated: items.length === query.limit });
}
