/**
 * CSR (Compressed Sparse Row) şebeke grafı.
 *
 * Düğüm evreni `network.components` ∪ `customer.customers`, kenar evreni `network.topology_edges`.
 * `Map<string, string[]>` yerine typed array kullanılır — 800 bin anahtarlı bir Map'te BFS pointer
 * chasing yüzünden ~20× yavaştır ve GC baskısı yaratır.
 */

/** `nodeFlags[n]` bit alanları. */
export const NodeFlag = {
  Switchable: 1 << 0,
  Energized: 1 << 1,
  IsSource: 1 << 2,
  IsCustomer: 1 << 3,
} as const;

/** `edgeFlags[e]` bit alanları — `e`, `targets` dizisindeki konumdur. */
export const EdgeFlag = {
  IsClosed: 1 << 0,
  NormallyOpen: 1 << 1,
  InOutageGraph: 1 << 2,
} as const;

export interface GraphNodeInput {
  id: string;
  isSource: boolean;
  isCustomer: boolean;
  switchable: boolean;
  energized: boolean;
}

export interface GraphEdgeInput {
  fromId: string;
  toId: string;
  isClosed: boolean;
  normallyOpen: boolean;
  inOutageGraph: boolean;
}

export interface CsrGraph {
  /** düğüm indeksi → id (component veya customer id). */
  nodeIds: string[];
  /** id → düğüm indeksi. */
  nodeIndex: Map<string, number>;
  nodeFlags: Uint8Array;
  /** `offsets[i] … offsets[i+1]-1` → düğüm i'nin komşularının `targets` içindeki aralığı. */
  offsets: Uint32Array;
  targets: Uint32Array;
  edgeFlags: Uint8Array;
  /** Kaynaktan (TM) en kısa yoldaki bir üst düğümün indeksi; kök (TM) veya erişilemeyen düğüm için -1. */
  parent: Int32Array;
}

/** Ham düğüm ve kenar listelerinden CSR yapısını kurar. Kenarlar yönsüz olarak iki yönde de eklenir. */
export function buildCsr(nodes: GraphNodeInput[], edges: GraphEdgeInput[]): CsrGraph {
  const nodeCount = nodes.length;
  const nodeIds = new Array<string>(nodeCount);
  const nodeIndex = new Map<string, number>();
  const nodeFlags = new Uint8Array(nodeCount);

  for (let i = 0; i < nodeCount; i++) {
    const n = nodes[i]!;
    nodeIds[i] = n.id;
    nodeIndex.set(n.id, i);

    let flags = 0;
    if (n.switchable) flags |= NodeFlag.Switchable;
    if (n.energized) flags |= NodeFlag.Energized;
    if (n.isSource) flags |= NodeFlag.IsSource;
    if (n.isCustomer) flags |= NodeFlag.IsCustomer;
    nodeFlags[i] = flags;
  }

  const degree = new Uint32Array(nodeCount);
  const resolvedFrom = new Int32Array(edges.length);
  const resolvedTo = new Int32Array(edges.length);
  const resolvedFlags = new Uint8Array(edges.length);
  let resolvedCount = 0;

  for (const e of edges) {
    const a = nodeIndex.get(e.fromId);
    const b = nodeIndex.get(e.toId);
    if (a === undefined || b === undefined) continue; // düğüm evreninde olmayan uç — atlanır

    let flags = 0;
    if (e.isClosed) flags |= EdgeFlag.IsClosed;
    if (e.normallyOpen) flags |= EdgeFlag.NormallyOpen;
    if (e.inOutageGraph) flags |= EdgeFlag.InOutageGraph;

    resolvedFrom[resolvedCount] = a;
    resolvedTo[resolvedCount] = b;
    resolvedFlags[resolvedCount] = flags;
    resolvedCount++;

    degree[a]!++;
    degree[b]!++;
  }

  const offsets = new Uint32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) offsets[i + 1] = offsets[i]! + degree[i]!;

  const targets = new Uint32Array(offsets[nodeCount]!);
  const edgeFlags = new Uint8Array(offsets[nodeCount]!);
  const cursor = offsets.slice(0, nodeCount);

  for (let i = 0; i < resolvedCount; i++) {
    const a = resolvedFrom[i]!;
    const b = resolvedTo[i]!;
    const flags = resolvedFlags[i]!;

    const ia = cursor[a]!++;
    targets[ia] = b;
    edgeFlags[ia] = flags;

    const ib = cursor[b]!++;
    targets[ib] = a;
    edgeFlags[ib] = flags;
  }

  return {
    nodeIds,
    nodeIndex,
    nodeFlags,
    offsets,
    targets,
    edgeFlags,
    parent: new Int32Array(nodeCount).fill(-1),
  };
}

/**
 * Kaynak düğümlerden (TM'ler) çok-kaynaklı BFS ile her düğümün besleme zincirindeki bir üst
 * düğümünü (`parent`) hesaplar. Yalnız kapalı (`IsClosed`) ve kesinti grafına dahil
 * (`InOutageGraph`) kenarlar üzerinden yürür. Sonuç `graph.parent` dizisine yazılır.
 */
export function computeSpanningParents(graph: CsrGraph, sourceIndices: number[]): number {
  const { offsets, targets, edgeFlags, parent } = graph;
  const nodeCount = graph.nodeIds.length;
  const visited = new Uint8Array(nodeCount);
  const queue = new Int32Array(nodeCount);
  let head = 0;
  let tail = 0;

  for (const s of sourceIndices) {
    if (visited[s]) continue;
    visited[s] = 1;
    queue[tail++] = s;
  }

  const REQUIRED = EdgeFlag.IsClosed | EdgeFlag.InOutageGraph;

  while (head < tail) {
    const cur = queue[head++]!;
    const start = offsets[cur]!;
    const end = offsets[cur + 1]!;

    for (let e = start; e < end; e++) {
      if ((edgeFlags[e]! & REQUIRED) !== REQUIRED) continue;

      const next = targets[e]!;
      if (visited[next]) continue;

      visited[next] = 1;
      parent[next] = cur;
      queue[tail++] = next;
    }
  }

  return tail;
}
