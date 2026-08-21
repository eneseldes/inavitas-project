import {
  assertInScope,
  NotFoundError,
  PERMISSIONS,
  UnauthenticatedError,
  type AuthedRequest,
} from '@inavitas/shared';
import type { Response } from 'express';
import { registerHighlightSet } from '../../modules/highlight/sets.ts';
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

/**
 * `GET /components/:id/trace?direction=up|down`
 *
 * Yanıt bir **vurgu token'ı** taşır (`setToken`); harita izi kimliklerden değil o token'ın
 * tile'larından çizilir (bkz. `onceden-yapilanlar.md` §11.1). Kimlik listesi yanıtta **yoktur**:
 * panel yalnız sayıları gösteriyor, listeyi okuyan kimse yoktu ve yüz binlerce elemanlı bir
 * izde tarayıcıya megabaytlarca ölü JSON taşınıyordu.
 */
export async function trace(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { direction } = TraceQuery.parse(req.query);

  await assertTraceableFrom(req, id);

  if (direction === 'down') {
    const impact = await impactService.computeDownstreamTrace(id);
    const set = await registerHighlightSet(req.user!, [{ role: 'down', ids: [id, ...impact.affectedElementIds] }]);
    res.json({
      direction,
      ...toDownstreamImpactDto(impact),
      bbox: toBboxDto(impact.bbox),
      setToken: set?.token ?? null,
      setTruncated: set?.truncated ?? false,
    });
    return;
  }

  const { chain, bbox } = await impactService.computeUpstreamChain(id);
  const set = await registerHighlightSet(req.user!, [{ role: 'up', ids: [id, ...chain.map((row) => row.id)] }]);
  res.json({
    direction,
    ...toUpstreamChainDto(id, chain),
    bbox: toBboxDto(bbox),
    setToken: set?.token ?? null,
    setTruncated: set?.truncated ?? false,
  });
}

/** `GET /components/:id/impact-preview` */
export async function impactPreview(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  await assertTraceableFrom(req, id);

  const preview = await impactService.computeImpactPreview(id);
  res.json(toImpactPreviewDto(preview));
}
