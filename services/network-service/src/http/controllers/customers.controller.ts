import { NotFoundError, parseSort, toPageResult, UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { Response } from 'express';
import { customers } from '../../db/schema.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import * as customersRepository from '../../repository/customers.repository.ts';
import { SORTABLE_FIELDS } from '../../repository/customers.repository.ts';
import { toCustomerDto, toCustomerPiiDto } from '../dto.ts';
import { ListCustomersQuery } from '../schemas.ts';
import { scopeFilter } from '../scope-filter.ts';

export async function list(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const query = ListCustomersQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'id', dir: 'asc' });
  const pagination = { page: query.page, pageSize: query.pageSize };
  const scope = scopeFilter(req.user, customers.unitPath);

  const { items, total } = await customersRepository.list(
    {
      unitPath: query.unitPath,
      customerType: query.customerType,
      status: query.status,
      parentId: query.parentId,
      tmId: query.tmId,
      feederId: query.feederId,
      dmId: query.dmId,
      transformerId: query.transformerId,
      scope,
    },
    pagination,
    sort,
  );

  res.json(toPageResult(items.map(toCustomerDto), total, query.page, query.pageSize));
}

export async function getById(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const row = await customersRepository.findById(id);
  if (!row) throw new NotFoundError('Abone', id);

  res.json(toCustomerDto(row));
}

/** Abonenin PII (tesisat/sözleşme) kaydı — ayrı izinle korunur, her okuma denetim kaydına düşer. */
export async function getPii(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const id = req.params.id as string;
  const row = await customersRepository.findPiiById(id);
  if (!row) throw new NotFoundError('Abone PII kaydı', id);

  req.log?.warn(
    { event: 'customer_pii_accessed', customerId: id, actorId: req.user.id, actorEmail: req.user.email },
    'Abone PII verisi okundu',
  );

  res.json(toCustomerPiiDto(row));
}

export async function getByComponent(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const componentId = req.params.id as string;
  const component = await componentsRepository.findById(componentId);
  if (!component) throw new NotFoundError('Şebeke elemanı', componentId);

  const query = ListCustomersQuery.parse(req.query);
  const sort = parseSort(query.sort, SORTABLE_FIELDS, { field: 'id', dir: 'asc' });
  const pagination = { page: query.page, pageSize: query.pageSize };
  const scope = scopeFilter(req.user, customers.unitPath);

  const { items, total } = await customersRepository.list({ componentId, scope }, pagination, sort);

  res.json(toPageResult(items.map(toCustomerDto), total, query.page, query.pageSize));
}
