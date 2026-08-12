import {
  ConflictError,
  NotFoundError,
  parseSort,
  toExclusiveUpperBound,
  toPageResult,
  UnauthenticatedError,
  type AuthedRequest,
} from '@inavitas/shared';
import type { Response } from 'express';
import { db } from '../../db.ts';
import { canTransition } from '../../domain/state-machine.ts';
import { enqueueWorkOrderCreatedTx, enqueueWorkOrderDoneTx } from '../../kafka/producer.ts';
import { notifyWorkOrderChanged } from '../../realtime.ts';
import * as workOrderRepository from '../../repository/work-order.repository.ts';
import { SORTABLE_FIELDS, type WorkOrderFilters } from '../../repository/work-order.repository.ts';
import { toWorkOrderDto, toWorkOrderHistoryDto } from '../dto.ts';
import { CreateWorkOrderBody, ListWorkOrdersQuery, PatchWorkOrderBody } from '../schemas.ts';

function toFilters(query: ListWorkOrdersQuery): WorkOrderFilters {
  return {
    status: query.status,
    origin: query.origin,
    type: query.type,
    gisId: query.gisId,
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

  // İş emri kaydı ve outbox bildirimi aynı transaction içinde yazılır.
  const row = await db.transaction(async (tx) => {
    const created = await workOrderRepository.createTx(
      tx,
      {
        gisId: body.gisId,
        type: body.type,
        status: body.status ?? 'STARTED',
        origin: 'USER',
        createdBy: user.email,
      },
      req.correlationId,
    );

    await enqueueWorkOrderCreatedTx(tx, created, req.correlationId!, user.email);
    return created;
  });

  req.log?.info({ workOrderId: row.id, gisId: row.gisId, status: row.status }, 'iş emri oluşturuldu');

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

    if (body.status !== current.status && row.status === 'DONE') {
      await enqueueWorkOrderDoneTx(tx, row, req.correlationId!, user.email);
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

