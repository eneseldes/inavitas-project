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
import { canTransition, type OutageStatus } from '../../domain/state-machine.ts';
import { enqueueOutageCreatedTx, enqueueOutageEnergizedIfNeededTx } from '../../kafka/producer.ts';
import { notifyOutageChanged } from '../../realtime.ts';
import * as outageRepository from '../../repository/outage.repository.ts';
import { SORTABLE_FIELDS, type OutageFilters } from '../../repository/outage.repository.ts';
import { toOutageDto, toOutageHistoryDto } from '../dto.ts';
import { CreateOutageBody, ListOutagesQuery, PatchOutageBody } from '../schemas.ts';

function toFilters(query: ListOutagesQuery): OutageFilters {
  return {
    status: query.status,
    origin: query.origin,
    gisId: query.gisId,
    startedAtFrom: query.startedAtFrom ? new Date(query.startedAtFrom) : undefined,
    startedAtTo: query.startedAtTo ? toExclusiveUpperBound(query.startedAtTo) : undefined,
    createdAtFrom: query.createdAtFrom ? new Date(query.createdAtFrom) : undefined,
    createdAtTo: query.createdAtTo ? toExclusiveUpperBound(query.createdAtTo) : undefined,
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

export async function create(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const body = CreateOutageBody.parse(req.body);

  const status: OutageStatus = body.endedAt ? 'ENERGIZED' : (body.status ?? 'STARTED');
  const user = req.user;

  // Kesinti kaydı ve outbox bildirimi aynı transaction içinde yazılır.
  const row = await db.transaction(async (tx) => {
    const created = await outageRepository.createTx(
      tx,
      {
        gisId: body.gisId,
        startedAt: new Date(body.startedAt),
        endedAt: body.endedAt ? new Date(body.endedAt) : null,
        status,
        origin: 'USER',
        createdBy: user.email,
      },
      req.correlationId,
    );

    await enqueueOutageCreatedTx(tx, created, req.correlationId!, user.email);
    return created;
  });

  req.log?.info({ outageId: row.id, gisId: row.gisId, status: row.status }, 'kesinti oluşturuldu');

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

  const updated = await db.transaction(async (tx) => {
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

    if (nextStatus !== current.status) {
      await enqueueOutageEnergizedIfNeededTx(tx, current.status, row, {
        origin: 'USER',
        actor: user.email,
        correlationId: req.correlationId!,
      });
    }

    return row;
  });

  if (!updated) {
    throw new ConflictError('Kayıt başka bir istekle güncellenmiş (version uyuşmazlığı)', [
      { field: 'version', issue: 'stale_version' },
    ]);
  }

  if (nextStatus !== current.status) {
    req.log?.info({ outageId: updated.id, from: current.status, to: nextStatus }, 'kesinti durumu değişti');
  }

  await notifyOutageChanged(updated, req.log);

  res.json(toOutageDto(updated));
}

export async function getHistory(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const current = await outageRepository.findById(id);
  if (!current) throw new NotFoundError('Kesinti', id);

  const rows = await outageRepository.getHistory(id);
  res.json({ items: rows.map(toOutageHistoryDto) });
}

