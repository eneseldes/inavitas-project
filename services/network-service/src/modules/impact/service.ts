/**
 * Etki hesabı ve önizleme — "bunu kesersem kim etkilenir" sorusunun cevabı.
 */

import { IMPACT_ID_LIMIT } from '@inavitas/contracts';
import { NotFoundError } from '@inavitas/shared';
import { NodeFlag } from '../../graph/csr.ts';
import { getGraph } from '../../graph/loader.ts';
import { traceDownstream, traceUpstream } from '../../graph/traverse.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import type { Bbox, ComponentRow } from '../../repository/components.repository.ts';
import * as outageStatesRepository from '../../repository/outage-states.repository.ts';
import * as energizationService from '../energization/service.ts';

/**
 * Etki kümesi çok büyük olabilir (TM kesintisinde binlerce eleman) — döndürülecek id sayısının
 * üst sınırı. `outage.impact.calculated` olayı da aynı sınırı taşır (bkz. `IMPACT_ID_LIMIT`).
 */
const ID_LIST_LIMIT = IMPACT_ID_LIMIT;

export interface DownstreamImpact {
  componentId: string;
  affectedElementIds: string[];
  affectedElementCount: number;
  /** Etkilenen abone kimlikleri — `ID_LIST_LIMIT` ile kırpılır, sayı kırpılmaz. */
  affectedCustomerIds: string[];
  affectedCustomerCount: number;
  overflowed: boolean;
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

  const { nodeIndices, radialityViolated } = traceDownstream(graph, startIdx);

  if (radialityViolated) {
    return {
      componentId,
      affectedElementIds: [],
      affectedElementCount: 0,
      affectedCustomerIds: [],
      affectedCustomerCount: 0,
      overflowed: false,
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
    affectedElementIds: affectedElementIds.length > ID_LIST_LIMIT ? affectedElementIds.slice(0, ID_LIST_LIMIT) : affectedElementIds,
    affectedElementCount: affectedElementIds.length,
    affectedCustomerIds:
      affectedCustomerIds.length > ID_LIST_LIMIT ? affectedCustomerIds.slice(0, ID_LIST_LIMIT) : affectedCustomerIds,
    affectedCustomerCount: affectedCustomerIds.length,
    overflowed: affectedElementIds.length > ID_LIST_LIMIT || affectedCustomerIds.length > ID_LIST_LIMIT,
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

  const { chainIndices } = traceUpstream(graph, startIdx);
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
 * bellek-içi bir kesişimdir, ek graf gezinmesi yoktur.
 */
export async function computeImpactPreview(componentId: string): Promise<ImpactPreview> {
  const component = await componentsRepository.findById(componentId);
  if (!component) throw new NotFoundError('Şebeke elemanı', componentId);

  const impact = computeDownstreamImpact(componentId);
  const childOutages = await findChildOutages(impact.affectedElementIds);

  return {
    ...impact,
    topologyLevel: component.topologyLevel,
    isEnergized: energizationService.isEnergized(componentId),
    deEnergizedBy: energizationService.deEnergizedBy(componentId),
    childOutages: childOutages.slice(0, CHILD_OUTAGE_PREVIEW_LIMIT),
    childOutageCount: childOutages.length,
  };
}

/** Aşağı akıştaki elemanlar üzerinde süren kesintileri, eleman bilgileriyle birlikte döner. */
async function findChildOutages(downstreamElementIds: string[]): Promise<ChildOutage[]> {
  if (downstreamElementIds.length === 0) return [];

  const activeStates = await outageStatesRepository.findActive();
  if (activeStates.length === 0) return [];

  const downstream = new Set(downstreamElementIds);
  const matched = activeStates.filter((state) => downstream.has(state.cbsId));
  if (matched.length === 0) return [];

  const rows = await componentsRepository.findByIds([...new Set(matched.map((s) => s.cbsId))]);
  const byId = new Map(rows.map((row) => [row.id, row]));

  return matched.map((state) => {
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
}
