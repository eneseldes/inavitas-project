/**
 * Enerjilenme durumunun sahibi.
 *
 * `graph/energization.ts` saf hesabı yapar; bu modül durumu bellekte tutar, aktif kesinti
 * read-model'inden cut köklerini kurar ve değişimi Redis üzerinden yayınlar.
 *
 * Durum **kalıcı yazılmaz**: `components.is_energized` seed'in başlangıç koşuludur.
 * Restart dayanıklılığı `outage_states_ro` replay'inden gelir — boot'ta read-model okunur,
 * hesap yeniden yapılır ve aynı sonuç üretilir.
 */

import type { Logger } from '@inavitas/shared';
import { NodeFlag } from '../../graph/csr.ts';
import {
  computeBaseline,
  emptyState,
  recompute,
  type CutRoot,
  type EnergizationState,
} from '../../graph/energization.ts';
import { getFeederBreakersOfTm, getGraph, isGraphLoaded } from '../../graph/loader.ts';
import {
  activeOutages,
  deEnergizedComponents,
  deEnergizedCustomers,
  energizationRecomputeSeconds,
} from '../../metrics.ts';
import * as outageStatesRepository from '../../repository/outage-states.repository.ts';
import { notifyEnergizationChanged } from '../../realtime.ts';
import { scheduleNextRecompute } from './scheduler.ts';

let baseline: Uint8Array | undefined;
let state: EnergizationState | undefined;
/**
 * Hesap yapılmadan önce dönülecek "her şey enerjili" durumu. Bir kez kurulur:
 * `emptyState` düğüm sayısı kadar dizi ayırır ve bu yol her istekte geçilebilir.
 */
let fallbackState: EnergizationState | undefined;

/** `/ready` kontrolü için: enerjilenme bir kez hesaplandı mı. */
export function isEnergizationReady(): boolean {
  return state !== undefined;
}

/**
 * Güncel durumu döner; henüz hesaplanmadıysa "her şey enerjili" varsayılır.
 *
 * Graf da yüklenmemişse (servis daha açılıyor) boş bir durum döner: bu uçlar hazır olmadan
 * cevap vermemeli, ama cevap veriyorsa "her şey normal" demek patlamaktan iyidir.
 */
export function getState(): EnergizationState {
  if (state) return state;
  fallbackState ??= emptyState(isGraphLoaded() ? getGraph().nodeIds.length : 0);
  return fallbackState;
}

/**
 * Aktif kesinti satırlarını graf üzerindeki cut köklerine çevirir.
 *
 * İki genişletme vardır:
 * - **K2** — kök `switchable` ise `BARRIER` (kesici üstünden beslenir, kendisi enerjili kalır),
 *   değilse `DEAD` (kendisi de enerjisiz).
 * - **K10** — kök bir TM ise kesinti onun **tüm `TM_FEEDER` kesicilerine** genişler. TM'nin
 *   kendisi anahtarlanamaz; "TM'ye kesinti açmak" fiziksel olarak her fiderin açılmasıdır.
 *   Harita artık tek tek fider seçtirmiyor, genişletmeyi sunucu yapıyor.
 */
function toCutRoots(rows: readonly outageStatesRepository.OutageStateRow[]): CutRoot[] {
  const graph = getGraph();
  const roots: CutRoot[] = [];

  for (const row of rows) {
    const idx = graph.nodeIndex.get(row.cbsId);
    if (idx === undefined) continue;

    if ((graph.nodeFlags[idx]! & NodeFlag.IsSource) !== 0) {
      const feeders = getFeederBreakersOfTm(row.cbsId);

      // Fideri olmayan bir TM (veri boşluğu) sessizce enerjili kalmasın: kökün kendisi kesilir.
      if (feeders.length === 0) {
        roots.push({ componentId: row.cbsId, outageId: row.outageId, kind: 'DEAD' });
        continue;
      }

      for (const feederId of feeders) {
        roots.push({ componentId: feederId, outageId: row.outageId, kind: 'BARRIER' });
      }
      continue;
    }

    const switchable = (graph.nodeFlags[idx]! & NodeFlag.Switchable) !== 0;
    roots.push({
      componentId: row.cbsId,
      outageId: row.outageId,
      kind: switchable ? 'BARRIER' : 'DEAD',
    });
  }

  return roots;
}

/**
 * Taban çizgisini hesaplar. Boot'ta, graf yüklendikten hemen sonra **bir kez** çağrılır.
 * Topoloji değişmediği sürece sabittir.
 */
export function initBaseline(logger: Logger): void {
  const startedAt = Date.now();
  const graph = getGraph();
  baseline = computeBaseline(graph);

  let baseEnergized = 0;
  for (let i = 0; i < baseline.length; i++) if (baseline[i] === 1) baseEnergized++;

  logger.info(
    {
      baseEnergized,
      baseUnreachable: graph.nodeIds.length - baseEnergized,
      durationMs: Date.now() - startedAt,
    },
    'enerjilenme taban çizgisi hesaplandı (tabanda erişilemeyenler enerjisiz sayılmaz)',
  );
}

/**
 * Aktif kesintileri read-model'den okuyup enerjisiz kümeyi yeniden hesaplar ve değişimi yayınlar.
 *
 * Hesap transaction'ın **dışında** yapılır — bellek işidir, DB'yi kilitlemez.
 *
 * ⚠️ Okunan küme **başlangıcı gelmiş** kesintilerdir (`started_at <= now()`, bkz.
 * `outage-states.repository.ts`). Gelecek tarihli planlı kesintiler için sonda bir
 * zamanlayıcı kurulur; o an gelince bu fonksiyon yeniden çağrılır.
 */
export async function refresh(logger: Logger): Promise<EnergizationState> {
  if (!baseline) throw new Error('Enerjilenme taban çizgisi hesaplanmadı — initBaseline() çağrılmadı');

  const startedAt = Date.now();
  const done = energizationRecomputeSeconds.startTimer();
  const rows = await outageStatesRepository.findActive();
  const roots = toCutRoots(rows);

  const next = recompute(getGraph(), baseline, roots, (state?.version ?? 0) + 1);
  state = next;
  fallbackState = undefined;
  done({});

  activeOutages.set({}, rows.length);
  deEnergizedComponents.set({}, next.deEnergizedCount);
  deEnergizedCustomers.set({}, next.deEnergizedCustomerCount);

  const durationMs = Date.now() - startedAt;
  logger.info(
    {
      version: next.version,
      activeOutages: rows.length,
      cutRoots: roots.length,
      deEnergizedCount: next.deEnergizedCount,
      deEnergizedCustomerCount: next.deEnergizedCustomerCount,
      durationMs,
    },
    'enerjilenme yeniden hesaplandı',
  );

  await notifyEnergizationChanged(
    { version: next.version, deEnergizedCount: next.deEnergizedCount },
    logger,
  );

  // Zamanlayıcı yayından SONRA kurulur: kurulumu bir DB sorgusu, yayın ise kullanıcının
  // beklediği şey. Kurulum her hesabın sonunda yenilendiği için iptal edilen ya da tarihi
  // değişen planlı kesinti kendiliğinden dikkate alınır.
  await scheduleNextRecompute(logger, refresh);

  return next;
}

/**
 * Bir elemanın şu an enerjili olup olmadığını söyler.
 *
 * Grafta olmayan eleman ve graf henüz yüklenmemişken enerjili sayılır: bu uçlar hazır olmadan
 * cevap vermemeli, ama cevap veriyorsa "her şey normal" demek "her şey karanlık" demekten
 * güvenlidir.
 */
export function isEnergized(componentId: string): boolean {
  if (!isGraphLoaded()) return true;
  const idx = getGraph().nodeIndex.get(componentId);
  if (idx === undefined) return true;
  return getState().deEnergized[idx] !== 1;
}

/** Elemanı karartan kesintinin kimliği; enerjiliyse ya da sebep bilinmiyorsa `null`. */
export function deEnergizedBy(componentId: string): string | null {
  if (!isGraphLoaded()) return null;
  const idx = getGraph().nodeIndex.get(componentId);
  if (idx === undefined) return null;

  const current = getState();
  if (current.deEnergized[idx] !== 1) return null;

  const slot = current.cause[idx];
  if (slot === undefined || slot < 0) return null;
  return current.causeOutageIds[slot] ?? null;
}

/**
 * Enerjisiz **elemanların** tüm kimlikleri (abone düğümleri hariç).
 *
 * Eskiden istemci pencereye göre kimlik istiyordu; artık istemci hiç kimlik almıyor — bu liste
 * yalnız vurgu kümesini kurmak için, sunucu içinde kullanılır (bkz. modules/highlight/sets.ts).
 * Kapsam süzmesi burada yapılmaz: küme tile'ının SQL'i zaten kapsamı uyguluyor.
 */
export function listDeEnergizedComponentIds(): string[] {
  if (!isGraphLoaded()) return [];

  const graph = getGraph();
  const current = getState();
  const out: string[] = [];

  for (let i = 0; i < graph.nodeIds.length; i++) {
    if (current.deEnergized[i] !== 1) continue;
    if ((graph.nodeFlags[i]! & NodeFlag.IsCustomer) !== 0) continue;
    out.push(graph.nodeIds[i]!);
  }

  return out;
}

/** Verilen kimliklerden enerjisiz olanları süzer (eleman detayı gibi tekil sorgular için). */
export function filterDeEnergized(componentIds: readonly string[]): string[] {
  if (!isGraphLoaded()) return [];

  const graph = getGraph();
  const current = getState();
  const out: string[] = [];

  for (const id of componentIds) {
    const idx = graph.nodeIndex.get(id);
    if (idx !== undefined && current.deEnergized[idx] === 1) out.push(id);
  }

  return out;
}
