/**
 * CSR grafı üzerinde BFS gezinmeleri.
 *
 * Etki hesabı her zaman `topology_edges` üzerinden yapılır, `parent_id` ağacından değil:
 * o ağaçta hat elemanları düğümün kardeşi olarak durur ve yanlış sonuç verir.
 */

import { EdgeFlag, NodeFlag, type CsrGraph } from './csr.ts';

export interface DownstreamResult {
  /** Kesilen düğüm hariç, aşağı akışta etkilenen tüm düğümlerin indeksleri. */
  nodeIndices: number[];
  /** Birden çok besleyici (kapalı ring) bulundu — radyallik varsayımı bozuldu, etki geçersiz. */
  radialityViolated: boolean;
}

const REQUIRED_EDGE = EdgeFlag.IsClosed | EdgeFlag.InOutageGraph;

/**
 * `startIdx` düğümünü "kesersek" aşağı akışta etkilenen düğümleri bulur.
 *
 * Üst yön (`parent[startIdx]`) önceden hesaplanmış olduğundan tek adımda hariç tutulur — büyük
 * üst-akış dallarını gezmeye gerek kalmaz. Gezinme sırasında bir kaynak (TM) düğümüne yeniden
 * ulaşılırsa (kapalı bir ring üzerinden alternatif besleme demektir) gezinme durur ve
 * `radialityViolated: true` döner.
 */
export function traceDownstream(graph: CsrGraph, startIdx: number): DownstreamResult {
  const { offsets, targets, edgeFlags, nodeFlags, parent } = graph;
  const parentIdx = parent[startIdx];

  const visited = new Set<number>([startIdx]);
  const stack: number[] = [];

  const pushNeighbors = (cur: number, excludeIdx: number): void => {
    const start = offsets[cur]!;
    const end = offsets[cur + 1]!;

    for (let e = start; e < end; e++) {
      if ((edgeFlags[e]! & REQUIRED_EDGE) !== REQUIRED_EDGE) continue;

      const next = targets[e]!;
      if (next === excludeIdx || visited.has(next)) continue;

      visited.add(next);
      stack.push(next);
    }
  };

  pushNeighbors(startIdx, parentIdx);

  while (stack.length > 0) {
    const cur = stack.pop()!;

    if ((nodeFlags[cur]! & NodeFlag.IsSource) !== 0) {
      return { nodeIndices: [], radialityViolated: true };
    }

    pushNeighbors(cur, startIdx);
  }

  visited.delete(startIdx);

  return { nodeIndices: Array.from(visited), radialityViolated: false };
}

export interface UpstreamResult {
  /** En yakın üstten TM'ye (kaynağa) kadar sırayla besleme zinciri düğüm indeksleri. */
  chainIndices: number[];
}

/** `startIdx` düğümünden TM'ye kadar önceden hesaplanmış besleme zincirini (`parent` işaretçileri) döner. */
export function traceUpstream(graph: CsrGraph, startIdx: number): UpstreamResult {
  const chainIndices: number[] = [];
  let cur = graph.parent[startIdx];

  while (cur !== -1) {
    chainIndices.push(cur);
    cur = graph.parent[cur];
  }

  return { chainIndices };
}
