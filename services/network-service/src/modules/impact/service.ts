/**
 * Etki hesabı ve önizleme — "bunu kesersem kim etkilenir" sorusunun cevabı.
 */

import { NotFoundError } from '@inavitas/shared';
import { HIGH_IMPACT_TOPOLOGY_LEVEL } from '../../domain/vocabulary.ts';
import { NodeFlag } from '../../graph/csr.ts';
import { getGraph } from '../../graph/loader.ts';
import { traceDownstream, traceUpstream } from '../../graph/traverse.ts';
import * as componentsRepository from '../../repository/components.repository.ts';
import type { Bbox, ComponentRow } from '../../repository/components.repository.ts';

/** Etki kümesi çok büyük olabilir (TM kesintisinde binlerce eleman) — döndürülecek id sayısının üst sınırı. */
const ID_LIST_LIMIT = 10_000;

export interface DownstreamImpact {
  componentId: string;
  affectedElementIds: string[];
  affectedElementCount: number;
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
      affectedCustomerCount: 0,
      overflowed: false,
      radialityViolated: true,
    };
  }

  const affectedElementIds: string[] = [];
  let affectedCustomerCount = 0;

  for (const idx of nodeIndices) {
    if ((graph.nodeFlags[idx]! & NodeFlag.IsCustomer) !== 0) {
      affectedCustomerCount++;
    } else {
      affectedElementIds.push(graph.nodeIds[idx]!);
    }
  }

  return {
    componentId,
    affectedElementIds: affectedElementIds.length > ID_LIST_LIMIT ? affectedElementIds.slice(0, ID_LIST_LIMIT) : affectedElementIds,
    affectedElementCount: affectedElementIds.length,
    affectedCustomerCount,
    overflowed: affectedElementIds.length > ID_LIST_LIMIT,
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

export interface ImpactPreview extends DownstreamImpact {
  topologyLevel: number;
  highImpact: boolean;
}

/** Etki önizlemesi — kesinti/iş emri açma öncesi onay adımında gösterilen özet. */
export async function computeImpactPreview(componentId: string): Promise<ImpactPreview> {
  const component = await componentsRepository.findById(componentId);
  if (!component) throw new NotFoundError('Şebeke elemanı', componentId);

  const impact = computeDownstreamImpact(componentId);

  return {
    ...impact,
    topologyLevel: component.topologyLevel,
    highImpact: component.topologyLevel <= HIGH_IMPACT_TOPOLOGY_LEVEL,
  };
}
