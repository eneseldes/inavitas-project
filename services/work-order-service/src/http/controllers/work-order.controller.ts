import {
  ConflictError,
  NotFoundError,
  parseSort,
  toExclusiveUpperBound,
  toPageResult,
  UnauthenticatedError,
  type AuthedRequest,
} from '@edas/shared';
import type { Response } from 'express';
import { canTransition } from '../../domain/state-machine.ts';
import * as workOrderRepository from '../../repository/work-order.repository.ts';
import { SORTABLE_FIELDS, type WorkOrderFilters } from '../../repository/work-order.repository.ts';
import { toWorkOrderDto } from '../dto.ts';
import { CreateWorkOrderBody, ListWorkOrdersQuery, PatchWorkOrderBody } from '../schemas.ts';

/**
 * Controller'lar ince: gövdeyi doğrula → repository/domain çağır → cevabı
 * biçimlendir. İş mantığı burada olmaz.
 */

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
  const id = req.params.id as string; // route ':id' — her zaman tek bir string
  const row = await workOrderRepository.findById(id);
  if (!row) throw new NotFoundError('İş emri', id);

  res.json(toWorkOrderDto(row));
}

export async function create(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const body = CreateWorkOrderBody.parse(req.body);

  const row = await workOrderRepository.create({
    gisId: body.gisId,
    type: body.type,
    status: body.status ?? 'STARTED',
    origin: 'USER',
    createdBy: req.user.id,
  });

  res.status(201).json(toWorkOrderDto(row));
}

export async function patch(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = PatchWorkOrderBody.parse(req.body);
  const current = await workOrderRepository.findById(id);

  if (!current) throw new NotFoundError('İş emri', id);

  if (body.status !== current.status && !canTransition(current.status, body.status)) {
    throw new ConflictError(`${current.status} durumundan ${body.status} durumuna geçilemez`, [
      { field: 'status', issue: 'invalid_transition' },
    ]);
  }

  const updated = await workOrderRepository.updateWithVersion(current.id, body.version, {
    status: body.status,
  });

  if (!updated) {
    throw new ConflictError('Kayıt başka bir istekle güncellenmiş (version uyuşmazlığı)', [
      { field: 'version', issue: 'stale_version' },
    ]);
  }

  res.json(toWorkOrderDto(updated));
}
