import type { AuthedRequest } from '@inavitas/shared';
import type { Response } from 'express';
import * as impactService from '../../modules/impact/service.ts';
import { toBboxDto, toDownstreamImpactDto, toImpactPreviewDto, toUpstreamChainDto } from '../dto.ts';
import { TraceQuery } from '../schemas.ts';

/** `GET /components/:id/trace?direction=up|down` */
export async function trace(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { direction } = TraceQuery.parse(req.query);

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
  const preview = await impactService.computeImpactPreview(id);
  res.json(toImpactPreviewDto(preview));
}
