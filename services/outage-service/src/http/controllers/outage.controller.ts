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
import { canTransition, type OutageStatus } from '../../domain/state-machine.ts';
import { publishOutageCreated, publishOutageEnergizedIfNeeded } from '../../kafka/producer.ts';
import * as outageRepository from '../../repository/outage.repository.ts';
import { SORTABLE_FIELDS, type OutageFilters } from '../../repository/outage.repository.ts';
import { toOutageDto, toOutageHistoryDto } from '../dto.ts';
import { CreateOutageBody, ListOutagesQuery, PatchOutageBody } from '../schemas.ts';

/**
 * Controller'lar ince: gövdeyi doğrula → repository/domain çağır → cevabı
 * biçimlendir. İş mantığı (durum geçişi, döngü koruması vb.) burada olmaz.
 */

function toFilters(query: ListOutagesQuery): OutageFilters {
  return {
    status: query.status,
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
  const id = req.params.id as string; // route ':id' — her zaman tek bir string
  const row = await outageRepository.findById(id);
  if (!row) throw new NotFoundError('Kesinti', id);

  res.json(toOutageDto(row));
}

export async function create(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const body = CreateOutageBody.parse(req.body);

  // FR-2.6: endedAt set edildiğinde durum otomatik ENERGIZED olur.
  const status: OutageStatus = body.endedAt ? 'ENERGIZED' : (body.status ?? 'STARTED');

  const row = await outageRepository.create(
    {
      gisId: body.gisId,
      startedAt: new Date(body.startedAt),
      endedAt: body.endedAt ? new Date(body.endedAt) : null,
      status,
      origin: 'USER',
      createdBy: req.user.email,
    },
    req.correlationId,
  );

  req.log?.info({ outageId: row.id, gisId: row.gisId, status: row.status }, 'kesinti oluşturuldu');

  await publishOutageCreated(row, req.correlationId!, req.user.email, req.log);

  res.status(201).json(toOutageDto(row));
}

export async function patch(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const id = req.params.id as string;
  const body = PatchOutageBody.parse(req.body);
  const current = await outageRepository.findById(id);

  if (!current) throw new NotFoundError('Kesinti', id);

  // FR-2.6: endedAt bu istekte ilk kez set ediliyorsa ve status verilmemişse otomatik ENERGIZED.
  const nextStatus: OutageStatus = body.status ?? (body.endedAt && !current.endedAt ? 'ENERGIZED' : current.status);

  if (nextStatus !== current.status && !canTransition(current.status, nextStatus)) {
    throw new ConflictError(`${current.status} durumundan ${nextStatus} durumuna geçilemez`, [
      { field: 'status', issue: 'invalid_transition' },
    ]);
  }

  const updated = await outageRepository.updateWithVersion(
    current.id,
    body.version,
    {
      status: nextStatus,
      endedAt: body.endedAt ? new Date(body.endedAt) : current.endedAt,
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

  if (nextStatus !== current.status) {
    req.log?.info({ outageId: updated.id, from: current.status, to: nextStatus }, 'kesinti durumu değişti');

    await publishOutageEnergizedIfNeeded(
      current.status,
      updated,
      { origin: 'USER', actor: req.user.email, correlationId: req.correlationId! },
      req.log,
    );
  }

  res.json(toOutageDto(updated));
}

export async function getHistory(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const current = await outageRepository.findById(id);
  if (!current) throw new NotFoundError('Kesinti', id);

  const rows = await outageRepository.getHistory(id);
  res.json({ items: rows.map(toOutageHistoryDto) });
}

