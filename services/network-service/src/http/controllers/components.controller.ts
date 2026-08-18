import { NotFoundError, parseSort, toPageResult, UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { Response } from 'express';
import { components } from '../../db/schema.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import { SORTABLE_FIELDS, type ComponentFilters } from '../../repository/components.repository.ts';
import { toComponentDetailDto, toComponentDto } from '../dto.ts';
import { ListComponentsQuery } from '../schemas.ts';
import { scopeFilter } from '../scope-filter.ts';

function toFilters(query: ListComponentsQuery): Omit<ComponentFilters, 'scope'> {
  return {
    type: query.type,
    category: query.category,
    breakerRole: query.breakerRole,
    voltageLevel: query.voltageLevel,
    topologyLevel: query.topologyLevel,
    unitPath: query.unitPath,
    parentId: query.parentId,
    tmId: query.tmId,
    feederId: query.feederId,
    dmId: query.dmId,
    transformerId: query.transformerId,
    q: query.q,
  };
}

export async function list(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const query = ListComponentsQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'id', dir: 'asc' });
  const pagination = { page: query.page, pageSize: query.pageSize };
  const scope = scopeFilter(req.user, components.unitPath);

  const { items, total } = await componentsRepository.list({ ...toFilters(query), scope }, pagination, sort);

  res.json(toPageResult(items.map(toComponentDto), total, query.page, query.pageSize));
}

export async function getById(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const row = await componentsRepository.findById(id);
  if (!row) throw new NotFoundError('Şebeke elemanı', id);

  const ancestors = await componentsRepository.findUnitAncestors(row.unitPath);

  res.json(toComponentDetailDto(row, ancestors));
}

export async function getChildren(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const id = req.params.id as string;
  const parent = await componentsRepository.findById(id);
  if (!parent) throw new NotFoundError('Şebeke elemanı', id);

  const query = ListComponentsQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'id', dir: 'asc' });
  const pagination = { page: query.page, pageSize: query.pageSize };
  const scope = scopeFilter(req.user, components.unitPath);

  const { items, total } = await componentsRepository.list({ parentId: id, scope }, pagination, sort);

  res.json(toPageResult(items.map(toComponentDto), total, query.page, query.pageSize));
}
