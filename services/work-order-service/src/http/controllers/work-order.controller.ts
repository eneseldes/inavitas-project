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
import { canTransition } from '../../domain/state-machine.ts';
import { publishWorkOrderCreated, publishWorkOrderDone } from '../../kafka/producer.ts';
import * as workOrderRepository from '../../repository/work-order.repository.ts';
import { SORTABLE_FIELDS, type WorkOrderFilters } from '../../repository/work-order.repository.ts';
import { toWorkOrderDto, toWorkOrderHistoryDto } from '../dto.ts';
import { CreateWorkOrderBody, ListWorkOrdersQuery, PatchWorkOrderBody } from '../schemas.ts';

function toFilters(query: ListWorkOrdersQuery): WorkOrderFilters {
  return {
    status: query.status,
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

  const body = CreateWorkOrderBody.parse(req.body);

  const row = await workOrderRepository.create(
    {
      gisId: body.gisId,
      type: body.type,
      status: body.status ?? 'STARTED',
      origin: 'USER',
      createdBy: req.user.email,
    },
    req.correlationId,
  );

  req.log?.info({ workOrderId: row.id, gisId: row.gisId, status: row.status }, 'iş emri oluşturuldu');

  await publishWorkOrderCreated(row, req.correlationId!, req.user.email, req.log);

  res.status(201).json(toWorkOrderDto(row));
}

export async function patch(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const id = req.params.id as string;
  const body = PatchWorkOrderBody.parse(req.body);
  const current = await workOrderRepository.findById(id);

  if (!current) throw new NotFoundError('İş emri', id);

  if (body.status !== current.status && !canTransition(current.status, body.status)) {
    throw new ConflictError(`${current.status} durumundan ${body.status} durumuna geçilemez`, [
      { field: 'status', issue: 'invalid_transition' },
    ]);
  }

  const updated = await workOrderRepository.updateWithVersion(
    current.id,
    body.version,
    {
      status: body.status,
    },
    {
      fromStatus: current.status,
      actor: req.user.email,
      origin: 'USER',
      correlationId: req.correlationId,
    },
  );

  if (!updated) {
    throw new ConflictError('Kayıt başka bir istekle güncellenmiş (version uyuşmazlığı)', [
      { field: 'version', issue: 'stale_version' },
    ]);
  }

  if (body.status !== current.status) {
    req.log?.info({ workOrderId: updated.id, from: current.status, to: body.status }, 'iş emri durumu değişti');

    if (updated.status === 'DONE') {
      await publishWorkOrderDone(updated, req.correlationId!, req.user.email, req.log);
    }
  }

  res.json(toWorkOrderDto(updated));
}

export async function getHistory(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const current = await workOrderRepository.findById(id);
  if (!current) throw new NotFoundError('İş emri', id);

  const rows = await workOrderRepository.getHistory(id);
  res.json({ items: rows.map(toWorkOrderHistoryDto) });
}

