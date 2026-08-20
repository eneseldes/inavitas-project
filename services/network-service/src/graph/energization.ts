/**
 * Enerjilenme motoru — "şu an hangi eleman enerjisiz" sorusunun tek kaynağı.
 *
 * Enerjilenme **türetilir, yazılmaz**: `network.components.is_energized` seed'in başlangıç
 * koşuludur ve runtime'da güncellenmez. Durum burada, aktif kesintiler + anahtar
 * pozisyonlarından her seferinde hesaplanır.
 *
 * Hesap, aktif kesintilerin downstream kümelerinin **birleşimi değildir**: iki kesinti üst üste
 * bindiğinde birini iptal etmek diğerinin karanlık bıraktığı bölgeyi de yanlışlıkla
 * aydınlatırdı. Bunun yerine tüm TM kaynaklarından kapalı kenarlar üzerinden global bir akış
 * doldurma (flood fill) yapılır; ulaşılamayan düğümler enerjisizdir. Bu O(V+E)'dir ve ring
 * topolojisini bedavaya doğru çözer — alternatif besleme varsa bölge zaten kararmaz.
 *
 * Bu modül saftır: I/O yapmaz, durum tutmaz. Sahibi `modules/energization/service.ts`'tir.
 */

import { EdgeFlag, NodeFlag, type CsrGraph } from './csr.ts';

/**
 * Kesinti kökünün graf üzerindeki etkisi.
 *
 * - `BARRIER` — kesici (`switchable = true`): **geçilemeyen ama ulaşılabilen** düğüm. Üstünden
 *   beslendiği için kendisi enerjili kalır, yalnız "açık" konuma geçer; altı kararır.
 * - `DEAD` — kesici olmayan eleman (TM · DM · TRANSFORMER · hat · buat …): **ulaşılamayan**
 *   düğüm. Kendisi de altı da enerjisizdir.
 */
export type CutKind = 'BARRIER' | 'DEAD';

/** Kenar koşulu — `traverse.ts`'teki `REQUIRED_EDGE` ile **birebir aynı** olmak zorundadır. */
const REQUIRED_EDGE = EdgeFlag.IsClosed | EdgeFlag.InOutageGraph;

/** Bir kesinti kökü: hangi eleman, hangi kesinti yüzünden, nasıl kesiliyor. */
export interface CutRoot {
  componentId: string;
  outageId: string;
  kind: CutKind;
}

export interface EnergizationState {
  /** Her hesapta artar; SSE ve istemci senkronu bunu kullanır. */
  version: number;
  /** Düğüm indeksi  enerjisiz mi (1/0). Abone düğümleri de işaretlidir. */
  deEnergized: Uint8Array;
  /** Enerjisiz **eleman** sayısı (abone hariç). */
  deEnergizedCount: number;
  /** Enerjisiz abone sayısı. */
  deEnergizedCustomerCount: number;
  /** Düğüm indeksi  `causeOutageIds` içindeki konum; sebebi bilinmeyende -1. */
  cause: Int32Array;
  /** `cause` dizisinin işaret ettiği kesinti kimlikleri. */
  causeOutageIds: string[];
  /**
   * "Açık konuma geçmiş" kesicilerin kimlikleri — `BARRIER` cut kökleri.
   *
   * İstemci bunları kendi başına türetemez: bir TM kesintisi N fider kesicisine
   * genişler ve o genişletme sunucudadır. Haritadaki "açık kontak" görüntüsü buna dayanır.
   */
  openSwitchIds: string[];
}

/**
 * Kaynak (TM) düğümlerinden kapalı kenarlar üzerinden akış doldurma.
 *
 * `cuts` haritası düğüm indeksinden kesinti türüne eşler: `DEAD` düğüme hiç girilmez,
 * `BARRIER` düğüme girilir (enerjili sayılır) ama komşuları açılmaz.
 */
function floodFill(graph: CsrGraph, cuts: ReadonlyMap<number, CutKind>): Uint8Array {
  const { offsets, targets, edgeFlags, nodeFlags } = graph;
  const nodeCount = graph.nodeIds.length;
  const reached = new Uint8Array(nodeCount);
  const queue = new Int32Array(nodeCount);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < nodeCount; i++) {
    if ((nodeFlags[i]! & NodeFlag.IsSource) === 0) continue;
    // Kaynağın kendisi kesilmişse (TM üzerine DEAD kesinti) besleme hiç başlamaz.
    if (cuts.get(i) === 'DEAD') continue;
    if (reached[i]) continue;
    reached[i] = 1;
    queue[tail++] = i;
  }

  while (head < tail) {
    const cur = queue[head++]!;

    // Bariyer düğüme ulaşıldı: enerjili sayılır ama üzerinden akım geçmez.
    if (cuts.get(cur) === 'BARRIER') continue;

    const start = offsets[cur]!;
    const end = offsets[cur + 1]!;

    for (let e = start; e < end; e++) {
      if ((edgeFlags[e]! & REQUIRED_EDGE) !== REQUIRED_EDGE) continue;

      const next = targets[e]!;
      if (reached[next]) continue;
      if (cuts.get(next) === 'DEAD') continue;

      reached[next] = 1;
      queue[tail++] = next;
    }
  }

  return reached;
}

/**
 * Taban çizgisi — hiç kesinti yokken hangi düğümlere ulaşılabildiği.
 *
 * Bu şart: kesinti olmasa bile bir kısım düğüm hiçbir TM'den kapalı yolla erişilemez
 * (normalde açık tie kesicileri ve `participates_in_outage_graph = false` olan HV mesh
 * kenarları). Bunlar enerjisiz **raporlanmamalıdır**, yoksa harita ilk açılışta kırmızıya
 * boyanır. Kural: `enerjisiz = tabanda_enerjili AND NOT şimdi_enerjili`.
 *
 * Boot'ta bir kez hesaplanır; topoloji değişmediği sürece sabittir.
 */
export function computeBaseline(graph: CsrGraph): Uint8Array {
  return floodFill(graph, new Map());
}

/** Kesinti köklerini düğüm indeksine çözer; grafta olmayan kimlikler sessizce atlanır. */
function resolveCuts(graph: CsrGraph, roots: readonly CutRoot[]): Map<number, CutKind> {
  const cuts = new Map<number, CutKind>();

  for (const root of roots) {
    const idx = graph.nodeIndex.get(root.componentId);
    if (idx === undefined) continue;

    // Aynı elemanda birden çok kesinti varsa daha sert olan (DEAD) kazanır.
    if (cuts.get(idx) === 'DEAD') continue;
    cuts.set(idx, root.kind);
  }

  return cuts;
}

/**
 * Enerjisiz kümeyi ve her enerjisiz düğümün sebebini hesaplar.
 *
 * Sebep etiketleme: kalan (enerjisiz) alt graf üzerinde her cut kökünden ikinci bir BFS
 * yapılır. Kökler `topology_level` artan sırayla işlenir; bir düğüm birden çok kesintinin
 * altındaysa **kaynağa en yakın** olan kazanır — kullanıcıya gösterilecek "asıl sebep" odur.
 * Etiketlenmiş düğümün içinden geçilmez, böylece toplam iş O(V+E) kalır.
 */
export function recompute(
  graph: CsrGraph,
  baseline: Uint8Array,
  roots: readonly CutRoot[],
  version: number,
): EnergizationState {
  const nodeCount = graph.nodeIds.length;
  const cuts = resolveCuts(graph, roots);
  const reached = floodFill(graph, cuts);

  const deEnergized = new Uint8Array(nodeCount);
  let deEnergizedCount = 0;
  let deEnergizedCustomerCount = 0;

  for (let i = 0; i < nodeCount; i++) {
    if (baseline[i] === 1 && reached[i] === 0) {
      deEnergized[i] = 1;
      if ((graph.nodeFlags[i]! & NodeFlag.IsCustomer) !== 0) deEnergizedCustomerCount++;
      else deEnergizedCount++;
    }
  }

  const cause = new Int32Array(nodeCount).fill(-1);
  const causeOutageIds: string[] = [];

  if (deEnergizedCount > 0 || deEnergizedCustomerCount > 0) {
    labelCauses(graph, deEnergized, roots, cause, causeOutageIds);
  }

  const openSwitchIds: string[] = [];
  for (const [idx, kind] of cuts) {
    if (kind === 'BARRIER') openSwitchIds.push(graph.nodeIds[idx]!);
  }

  return {
    version,
    deEnergized,
    deEnergizedCount,
    deEnergizedCustomerCount,
    cause,
    causeOutageIds,
    openSwitchIds,
  };
}

function labelCauses(
  graph: CsrGraph,
  deEnergized: Uint8Array,
  roots: readonly CutRoot[],
  cause: Int32Array,
  causeOutageIds: string[],
): void {
  const { offsets, targets, edgeFlags, topologyLevels } = graph;

  const resolved = roots
    .map((root) => ({ root, idx: graph.nodeIndex.get(root.componentId) }))
    .filter((entry): entry is { root: CutRoot; idx: number } => entry.idx !== undefined)
    .sort((a, b) => topologyLevels[a.idx]! - topologyLevels[b.idx]!);

  const stack: number[] = [];

  for (const { root, idx } of resolved) {
    const outageSlot = causeOutageIds.length;
    let used = false;

    // Kökün kendisi `BARRIER` ise enerjili kalır; sebep etiketi almaz ama komşularına
    // yayılmanın başlangıç noktasıdır. `DEAD` ise kendisi de bu kesintinin sonucudur.
    if (deEnergized[idx] === 1 && cause[idx] === -1) {
      cause[idx] = outageSlot;
      used = true;
    }

    stack.length = 0;
    stack.push(idx);

    while (stack.length > 0) {
      const cur = stack.pop()!;
      const start = offsets[cur]!;
      const end = offsets[cur + 1]!;

      for (let e = start; e < end; e++) {
        if ((edgeFlags[e]! & REQUIRED_EDGE) !== REQUIRED_EDGE) continue;

        const next = targets[e]!;
        // Etiketlenmiş düğümün içinden geçilmez: onu talep eden kök kaynağa daha yakındır ve
        // altındaki her şeyi zaten talep etmiştir. Toplam iş bu sayede O(V+E) kalır.
        if (deEnergized[next] !== 1 || cause[next] !== -1) continue;

        cause[next] = outageSlot;
        used = true;
        stack.push(next);
      }
    }

    if (used) causeOutageIds.push(root.outageId);
  }
}

/** Boot öncesi / hesap yapılmamış durum — her şey enerjili. */
export function emptyState(nodeCount: number): EnergizationState {
  return {
    version: 0,
    deEnergized: new Uint8Array(nodeCount),
    deEnergizedCount: 0,
    deEnergizedCustomerCount: 0,
    cause: new Int32Array(nodeCount).fill(-1),
    causeOutageIds: [],
    openSwitchIds: [],
  };
}
