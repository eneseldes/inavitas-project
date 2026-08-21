import {
  isUnitVisible,
  NotFoundError,
  OutOfScopeError,
  parseSort,
  PERMISSIONS,
  scopeFilterUnitTree,
  toPageResult,
  UnauthenticatedError,
  type AuthedRequest,
} from '@inavitas/shared';
import type { Response } from 'express';
import * as unitsRepository from '../../repository/units.repository.ts';
import { SORTABLE_FIELDS } from '../../repository/units.repository.ts';
import { toUnitDto } from '../dto.ts';
import { ListUnitsQuery } from '../schemas.ts';
import { units } from '../../db/schema.ts';

export async function list(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const query = ListUnitsQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'path', dir: 'asc' });
  const pagination = { page: query.page, pageSize: query.pageSize };
  const scope = scopeFilterUnitTree(req.user, units.path, PERMISSIONS.NETWORK_READ);

  const { items, total } = await unitsRepository.list(
    { level: query.level, parentPath: query.parentPath, scope },
    pagination,
    sort,
  );

  res.json(toPageResult(items.map(toUnitDto), total, query.page, query.pageSize));
}

export async function getByPath(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const path = req.params.path as string;
  const row = await unitsRepository.findByPath(path);
  if (!row) throw new NotFoundError('Birim', path);

  if (!isUnitVisible(req.user, PERMISSIONS.NETWORK_READ, row.path)) throw new OutOfScopeError(path, row.path);

  res.json(toUnitDto(row));
}

export async function getChildren(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const path = req.params.path as string;
  const parent = await unitsRepository.findByPath(path);
  if (!parent) throw new NotFoundError('Birim', path);

  const query = ListUnitsQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'name', dir: 'asc' });
  const pagination = { page: query.page, pageSize: query.pageSize };
  const scope = scopeFilterUnitTree(req.user, units.path, PERMISSIONS.NETWORK_READ);

  const { items, total } = await unitsRepository.children(path, pagination, sort, scope);

  res.json(toPageResult(items.map(toUnitDto), total, query.page, query.pageSize));
}
