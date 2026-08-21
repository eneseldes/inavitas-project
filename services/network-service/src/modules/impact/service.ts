/**
 * Etki hesabı ve önizleme — "bunu kesersem kim etkilenir" sorusunun cevabı.
 */

import { CASCADE_OUTAGE_LIMIT } from '@inavitas/contracts';
import { NotFoundError } from '@inavitas/shared';
import { NodeFlag } from '../../graph/csr.ts';
import { getGraph } from '../../graph/loader.ts';
import { traceDownstream, traceUpstream } from '../../graph/traverse.ts';
import { graphTraverseNodes, graphTraverseSeconds } from '../../metrics.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import type { Bbox, ComponentRow } from '../../repository/components.repository.ts';
import * as outageStatesRepository from '../../repository/outage-states.repository.ts';
import * as energizationService from '../energization/service.ts';

/**
 * ⚠️ Burada **hiçbir üst sınır yoktur** — etki hesabı ne kadar eleman buluyorsa o kadarını
 * döner. Eskiden liste `IMPACT_ID_LIMIT` (10.000) ile kırpılıyordu ve bunun üç sessiz
 * sonucu vardı: (1) harita izi eksik çiziliyordu, (2) kaskad onayında alt kesintiler
 * görünmüyordu, (3) yeni açılan bir üst kesinti 10.000'inci elemandan sonrasındaki alt
 * kesintileri hiç bulamadığı için onları kendine BAĞLAMIYORDU.
 *
 * Kırpma artık tek bir yerde, gerçekten zorunlu olduğu sınırda yapılır: `outage-service`'e
 * giden `outage.impact.calculated` **Kafka olayında** (mesaj boyutu sınırı — bkz.
 * kafka/consumers.ts `handleOutageCreated`). Hesabın kendisi ve HTTP uçları tamdır.
 */
export interface DownstreamImpact {
  componentId: string;
  /** Etkilenen eleman kimlikleri — **kırpılmaz**. */
  affectedElementIds: string[];
  affectedElementCount: number;
  /** Etkilenen abone kimlikleri — **kırpılmaz**. */
  affectedCustomerIds: string[];
  affectedCustomerCount: number;
  radialityViolated: boolean;
}

function findComponentNodeIndex(componentId: string): number {
  const idx = getGraph().nodeIndex.get(componentId);
  if (idx === undefined) throw new NotFoundError('Şebeke elemanı', componentId);
  return idx;
}

/**
 * `componentId`'yi "kesersek" aşağı akışta etkilenen eleman ve abone kümesini hesaplar.
 * Radyallik varsayımı bozulmuşsa (kapalı bir ring üzerinden alternatif besleme) etki boş
 * küme döner ve `radialityViolated: true` işaretlenir.
 */
export function computeDownstreamImpact(componentId: string): DownstreamImpact {
  const graph = getGraph();
  const startIdx = findComponentNodeIndex(componentId);

  // Ölçüm gezinmenin kendisini sarar, çağıranın DB işlerini değil: kabul ölçütündeki
  // "downstream (10k düğüm) < 50 ms" hedefi saf graf işine ait.
  const done = graphTraverseSeconds.startTimer();
  const { nodeIndices, radialityViolated } = traceDownstream(graph, startIdx);
  done({ kind: 'downstream' });
  graphTraverseNodes.observe({ kind: 'downstream' }, nodeIndices.length);

  if (radialityViolated) {
    return {
      componentId,
      affectedElementIds: [],
      affectedElementCount: 0,
      affectedCustomerIds: [],
      affectedCustomerCount: 0,
      radialityViolated: true,
    };
  }

  const affectedElementIds: string[] = [];
  const affectedCustomerIds: string[] = [];

  for (const idx of nodeIndices) {
    if ((graph.nodeFlags[idx]! & NodeFlag.IsCustomer) !== 0) {
      affectedCustomerIds.push(graph.nodeIds[idx]!);
    } else {
      affectedElementIds.push(graph.nodeIds[idx]!);
    }
  }

  return {
    componentId,
    affectedElementIds,
    affectedElementCount: affectedElementIds.length,
    affectedCustomerIds,
    affectedCustomerCount: affectedCustomerIds.length,
    radialityViolated: false,
  };
}

/**
 * `computeDownstreamImpact`'in harita odağı (`fitBounds`) için genişletilmiş hâli — hem
 * kesilen elemanı hem etkilenen tüm alanı kapsayan dikdörtgeni de döner. Yalnız `/trace`
 * ucunda kullanılır; `impact-preview`'un harita etkileşimi olmadığından bu ek sorguya
 * ihtiyacı yok, o yüzden `computeDownstreamImpact` sync/DB'siz kalmaya devam ediyor.
 */
export async function computeDownstreamTrace(componentId: string): Promise<DownstreamImpact & { bbox: Bbox | null }> {
  const impact = computeDownstreamImpact(componentId);

  if (impact.radialityViolated) {
    return { ...impact, bbox: null };
  }

  const bbox = await componentsRepository.findBoundingBox([componentId, ...impact.affectedElementIds]);

  return { ...impact, bbox };
}

export interface UpstreamChain {
  componentId: string;
  /** En yakın üstten TM'ye kadar sırayla besleme zinciri. */
  chain: ComponentRow[];
  bbox: Bbox | null;
}

/** `componentId`'den TM'ye kadar besleme zincirini (upstream trace) döner. */
export async function computeUpstreamChain(componentId: string): Promise<UpstreamChain> {
  const graph = getGraph();
  const startIdx = findComponentNodeIndex(componentId);

  const done = graphTraverseSeconds.startTimer();
  const { chainIndices } = traceUpstream(graph, startIdx);
  done({ kind: 'upstream' });
  graphTraverseNodes.observe({ kind: 'upstream' }, chainIndices.length);

  const chainIds = chainIndices.map((idx) => graph.nodeIds[idx]!);

  const [rows, bbox] = await Promise.all([
    componentsRepository.findByIds(chainIds),
    componentsRepository.findBoundingBox([componentId, ...chainIds]),
  ]);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain = chainIds.map((id) => byId.get(id)).filter((row): row is ComponentRow => row !== undefined);

  return { componentId, chain, bbox };
}

/**
 * Kaskad onay modalında listelenecek alt kesinti sayısı. Liste kırpılır, **sayı kırpılmaz** —
 * kullanıcıya "3 tanesi gösteriliyor, toplam 214" demek, 214'ü hiç söylememekten iyidir.
 * TM'ye açılan bir kesintide (tüm fiderlerine genişler) bu sınır sık devreye girer.
 */
export const CHILD_OUTAGE_PREVIEW_LIMIT = 50;

/** Kaskad onay modalını besleyen alt kesinti özeti. */
export interface ChildOutage {
  outageId: string;
  cbsId: string;
  componentName: string | null;
  componentType: string;
  status: string;
  affectedCustomerCount: number;
}

export interface ImpactPreview extends DownstreamImpact {
  topologyLevel: number;
  /** Elemanın **şu anki** enerjilenme durumu — kolondan değil, runtime'dan. */
  isEnergized: boolean;
  /** Elemanı karartan kesinti; enerjiliyse `null`. */
  deEnergizedBy: string | null;
  /** Beslediği hatta hâlihazırda süren kesintiler (kaskad onayı). */
  childOutages: ChildOutage[];
  /** Kırpılmamış toplam alt kesinti sayısı. */
  childOutageCount: number;
}

/**
 * Etki önizlemesi — kesinti/iş emri açma öncesi onay adımında gösterilen özet.
 *
 * `childOutages` hesabı `traceDownstream` sonucu ∩ aktif kesintilerin `cbs_id`'leridir;
 * bellek-içi bir kesişimdir, ek graf gezinmesi yoktur. Kesişim artık **kırpılmamış** küme
 * üzerinde yapılır — eskiden ilk 10.000 elemana bakılıyordu ve TM ölçeğinde bir kesintide
 * alt kesintiler onay ekranında hiç görünmüyordu.
 */
export async function computeImpactPreview(componentId: string): Promise<ImpactPreview> {
  const component = await componentsRepository.findById(componentId);
  if (!component) throw new NotFoundError('Şebeke elemanı', componentId);

  const impact = computeDownstreamImpact(componentId);
  const { children, total } = await findChildOutages(impact.affectedElementIds);

  return {
    ...impact,
    topologyLevel: component.topologyLevel,
    isEnergized: energizationService.isEnergized(componentId),
    deEnergizedBy: energizationService.deEnergizedBy(componentId),
    childOutages: children,
    childOutageCount: total,
  };
}

/**
 * Kaskad adayları — `outage.impact.calculated` olayının taşıdığı iki alan.
 *
 * Bu hesabın **burada** yapılmasının sebebi mimari: kapsama kararı grafın sahibinin
 * verebileceği bir karardır. `outage-service` onu eskiden kırpılmış `affectedElementIds`
 * listesi üzerinden çıkarmaya çalışıyordu ve 10.000'inci elemandan sonrasını göremiyordu
 * (bkz. `onceden-yapilanlar.md` §11.4). Artık karar burada verilir, olayda **sonuç** taşınır:
 * liste eleman değil aktif kesinti sayar, o yüzden Kafka sınırına hiç yaklaşmaz.
 */
export interface CascadeCandidates {
  /** Aşağı akışta süren kesintilerin kimlikleri (kapsanacaklar). */
  containedOutageIds: string[];
  /** Besleme zincirinde yukarı doğru bulunan İLK süren kesinti — en dar kapsayan. */
  containingOutageId: string | null;
}

/**
 * `componentId` için kaskad adaylarını çıkarır.
 *
 * Kapsayan taraf `traceUpstream` ile bulunur, `traceDownstream` ile değil: radyal bir ağda
 * "X, P'nin aşağı akışındadır" ile "P, X'in besleme zincirindedir" aynı önermedir ve
 * ikincisi zincir boyu kadar (onlarca adım) iş yapar — her aktif kesintinin downstream'ini
 * ayrı ayrı gezmek yerine.
 */
export async function computeCascadeCandidates(
  componentId: string,
  downstreamElementIds: string[],
  excludeOutageId: string,
): Promise<CascadeCandidates> {
  const activeStates = await outageStatesRepository.findActive();
  const relevant = activeStates.filter((state) => state.outageId !== excludeOutageId);
  if (relevant.length === 0) return { containedOutageIds: [], containingOutageId: null };

  const byCbsId = new Map<string, outageStatesRepository.OutageStateRow[]>();
  for (const state of relevant) {
    const bucket = byCbsId.get(state.cbsId);
    if (bucket) bucket.push(state);
    else byCbsId.set(state.cbsId, [state]);
  }

  // Kapsananlar: aşağı akış listesi bir kez taranır, küme küçük taraftan (aktif kesintiler)
  // kurulur — 600 bin string'lik bir küme ayırmanın anlamı yok (bkz. `findChildOutages`).
  const containedOutageIds: string[] = [];
  for (const id of downstreamElementIds) {
    const bucket = byCbsId.get(id);
    if (bucket) for (const state of bucket) containedOutageIds.push(state.outageId);
    if (containedOutageIds.length >= CASCADE_OUTAGE_LIMIT) break;
  }

  // Kapsayan: besleme zincirinde yukarı doğru İLK isabet. `traceUpstream` zinciri en yakın
  // üstten kaynağa (TM) doğru sıralı döndürür, dolayısıyla ilk isabet en dar kapsayandır.
  const graph = getGraph();
  const startIdx = graph.nodeIndex.get(componentId);
  let containingOutageId: string | null = null;
  if (startIdx !== undefined) {
    for (const idx of traceUpstream(graph, startIdx).chainIndices) {
      const bucket = byCbsId.get(graph.nodeIds[idx]!);
      if (bucket?.[0]) {
        containingOutageId = bucket[0].outageId;
        break;
      }
    }
  }

  return { containedOutageIds, containingOutageId };
}

/**
 * Aşağı akıştaki elemanlar üzerinde süren kesintileri, eleman bilgileriyle birlikte döner.
 * Liste `CHILD_OUTAGE_PREVIEW_LIMIT` ile kırpılır; `total` kırpılmamış sayıdır.
 *
 * İki tasarım kararı, ikisi de kırpma kalktıktan sonra ölçüldü:
 *
 * 1. **Kesişim küçük tarafın üstünden kurulur.** `new Set(downstreamElementIds)` demek, bir TM
 *    izinde 593 bin string'lik bir küme ayırmaktı (~60 MB, ~250 ms) — üstelik bu fonksiyon her
 *    seçimde ve her SSE dalgasında çağrılıyor. Aktif kesinti sayısı ise her zaman küçüktür;
 *    küme ondan kurulur, aşağı akış listesi bir kez taranır.
 * 2. **Abone sayısı yalnız GÖSTERİLEN satırlar için hesaplanır.** Her satır kendi başına bir
 *    tam graf gezinmesidir; kırpmadan önce hesaplamak 200 alt kesintide 200 BFS demekti,
 *    bunların 150'si zaten hiç ekrana gelmiyordu.
 */
async function findChildOutages(
  downstreamElementIds: string[],
): Promise<{ children: ChildOutage[]; total: number }> {
  const empty = { children: [], total: 0 };
  if (downstreamElementIds.length === 0) return empty;

  const activeStates = await outageStatesRepository.findActive();
  if (activeStates.length === 0) return empty;

  const activeByCbsId = new Map<string, outageStatesRepository.OutageStateRow[]>();
  for (const state of activeStates) {
    const bucket = activeByCbsId.get(state.cbsId);
    if (bucket) bucket.push(state);
    else activeByCbsId.set(state.cbsId, [state]);
  }

  const matched: outageStatesRepository.OutageStateRow[] = [];
  for (const id of downstreamElementIds) {
    const bucket = activeByCbsId.get(id);
    if (bucket) matched.push(...bucket);
  }
  if (matched.length === 0) return empty;

  const shown = matched.slice(0, CHILD_OUTAGE_PREVIEW_LIMIT);
  const rows = await componentsRepository.findByIds([...new Set(shown.map((s) => s.cbsId))]);
  const byId = new Map(rows.map((row) => [row.id, row]));

  const children = shown.map((state) => {
    const component = byId.get(state.cbsId);
    return {
      outageId: state.outageId,
      cbsId: state.cbsId,
      componentName: component?.name ?? null,
      componentType: component?.type ?? 'UNKNOWN',
      status: state.status,
      // Abone sayısı `outage-service`'in etki tablosunda durur; burada onu sormak senkron
      // servisler-arası çağrı olurdu. Alt kesintinin kendi downstream'i bellek-içi hesaplanır.
      affectedCustomerCount: component ? computeDownstreamImpact(state.cbsId).affectedCustomerCount : 0,
    };
  });

  return { children, total: matched.length };
}
