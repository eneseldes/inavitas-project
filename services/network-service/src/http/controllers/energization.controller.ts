import {
  PERMISSIONS,
  scopeFilterAnyUnit,
  UnauthenticatedError,
  type AuthedRequest,
} from '@inavitas/shared';
import type { Response } from 'express';
import { components } from '../../db/schema.ts';
import * as energizationService from '../../modules/energization/service.ts';
import { resolveZoomLod } from '../../modules/tiles/zoom-lod.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import { EnergizationQuery } from '../schemas.ts';

/**
 * `GET /network/energization?bbox=minLon,minLat,maxLon,maxLat&zoom=`
 *
 * O görünüm penceresindeki **enerjisiz** eleman kimliklerini döner. İstemci bunları
 * `setFeatureState` ile haritaya yazar.
 *
 * Liste kapsam süzgecinden geçer: tile'ı süzüp bu ucu açık bırakmak, kapsam dışı
 * elemanların kimliklerini pencereyi kaydırarak toplanabilir hale getirirdi.
 */
export async function getEnergization(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const { bbox, zoom } = EnergizationQuery.parse(req.query);
  const state = energizationService.getState();

  // Hiçbir kesinti yoksa veritabanına hiç gidilmez — kesintisiz bir günde bu uç her
  // `moveend`'de çağrılıyor olacak.
  if (state.deEnergizedCount === 0 && state.deEnergizedCustomerCount === 0 && state.openSwitchIds.length === 0) {
    res.json({ version: state.version, deEnergizedIds: [], openSwitchIds: [], truncated: false });
    return;
  }

  const lod = resolveZoomLod(zoom);
  const { ids, truncated } = await componentsRepository.findIdsInViewport(
    bbox,
    {
      types: lod.componentTypes,
      includeServiceEntry: lod.includeServiceEntry,
      includeBuildings: lod.includeBuildings,
    },
    scopeFilterAnyUnit(req.user, components.unitPath, components.unitPaths, PERMISSIONS.NETWORK_READ),
  );

  const inViewport = new Set(ids);

  res.json({
    version: state.version,
    deEnergizedIds: energizationService.filterDeEnergized(ids),
    // Açık kesiciler viewport'a göre süzülür ama listeye tile'da olmayanlar da girmez;
    // `setFeatureState` zaten yalnız yüklü tile'lara yazılabiliyor.
    openSwitchIds: state.openSwitchIds.filter((id) => inViewport.has(id)),
    truncated,
  });
}
