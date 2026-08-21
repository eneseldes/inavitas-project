import {
  assertInScope,
  NotFoundError,
  PERMISSIONS,
  UnauthenticatedError,
  type AuthedRequest,
} from '@inavitas/shared';
import type { Response } from 'express';
import * as impactService from '../../modules/impact/service.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import { toBboxDto, toDownstreamImpactDto, toImpactPreviewDto, toUpstreamChainDto } from '../dto.ts';
import { TraceQuery } from '../schemas.ts';

/**
 * İz ve önizleme graf üzerinde yürür; kapsam sorguya eklenemez (graf bellek-içi bir CSR
 * yapısıdır, SQL değil). Bu yüzden kapı **başlangıç elemanındadır**: kapsam dışı bir
 * elemandan iz başlatılamaz. İzin ulaştığı elemanlar kapsam dışına taşabilir — bu bilinçli,
 * "bunu kesersem komşu ilçede kim kararır" sorusunun cevabı zaten işin kendisidir.
 */
async function assertTraceableFrom(req: AuthedRequest, id: string): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const component = await componentsRepository.findById(id);
  if (!component) throw new NotFoundError('Şebeke elemanı', id);

  assertInScope(req.user, PERMISSIONS.NETWORK_TRACE, component.unitPath, id);
}

/** `GET /components/:id/trace?direction=up|down` */
export async function trace(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { direction } = TraceQuery.parse(req.query);

  await assertTraceableFrom(req, id);

  if (direction === 'down') {
    const impact = await impactService.computeDownstreamTrace(id);
    res.json({ direction, ...toDownstreamImpactDto(impact), bbox: toBboxDto(impact.bbox) });
    return;
  }

  const { chain, bbox } = await impactService.computeUpstreamChain(id);
  res.json({ direction, ...toUpstreamChainDto(id, chain), bbox: toBboxDto(bbox) });
}

/** `GET /components/:id/impact-preview` */
export async function impactPreview(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  await assertTraceableFrom(req, id);

  const preview = await impactService.computeImpactPreview(id);
  res.json(toImpactPreviewDto(preview));
}
