import { UnauthenticatedError, type AuthedRequest } from '@inavitas/shared';
import type { Response } from 'express';
import * as energizationService from '../../modules/energization/service.ts';
import { registerHighlightSet } from '../../modules/highlight/sets.ts';

/**
 * `GET /network/energization`
 *
 * Enerjisiz kümenin **vurgu token'ını** döner; kimlik listesi istemciye hiç gitmez.
 *
 * Eskiden bu uç `bbox` + `zoom` alıyor, pencereye ve zoom LOD'una göre kırpılmış bir kimlik
 * listesi dönüyordu. İki sonucu vardı: (1) ekrandan çıkan hat kimlik listesinden düşüyor ve
 * `feature-state` temizlendiği için kırmızılığını kaybediyordu, (2) LV hattı gibi düşük
 * zoom'da tile'a hiç girmeyen tipler hiçbir zaman boyanamıyordu. Küme tile'ı ikisini de
 * ortadan kaldırır: kırpma yok, LOD yok — yalnız görünen kare indirilir
 * (bkz. `onceden-yapilanlar.md` §11.1).
 */
export async function getEnergization(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw new UnauthenticatedError();

  const state = energizationService.getState();

  // Hiçbir kesinti yoksa küme de yoktur; istemci `setToken: null` görünce vurgu katmanlarını
  // hiç açmaz ve tek bir tile isteği bile çıkmaz.
  if (state.deEnergizedCount === 0 && state.openSwitchIds.length === 0) {
    res.json({
      version: state.version,
      setToken: null,
      deEnergizedCount: 0,
      openSwitchCount: 0,
      truncated: false,
    });
    return;
  }

  const set = await registerHighlightSet(req.user, [
    { role: 'dead', ids: energizationService.listDeEnergizedComponentIds() },
    // Açık kesici enerjisizin üstünde bir roldür (bkz. sets.ts ROLE_PRIORITY): kesici
    // üstünden beslendiği için enerjilidir, ama "açık kontak" olarak çizilmelidir.
    { role: 'open', ids: state.openSwitchIds },
  ]);

  res.json({
    version: state.version,
    setToken: set?.token ?? null,
    deEnergizedCount: state.deEnergizedCount,
    openSwitchCount: state.openSwitchIds.length,
    truncated: set?.truncated ?? false,
  });
}
