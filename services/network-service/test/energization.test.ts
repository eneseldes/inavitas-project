import { describe, expect, it } from 'vitest';
import { buildCsr, type GraphEdgeInput, type GraphNodeInput } from '../src/graph/csr.ts';
import { computeBaseline, recompute, type CutRoot } from '../src/graph/energization.ts';

/**
 * Sentetik test şebekesi — gerçek Ankara verisine ihtiyaç duymadan motorun kurallarını doğrular.
 *
 *            TM ── brk1 ── dm ── brk2 ── trafo ── lvj ── kofraBrk ── ev
 *             │
 * └── tie (normalde AÇIK) ── ada    tabanda da erişilemez
 */
function node(
  id: string,
  overrides: Partial<GraphNodeInput> = {},
): GraphNodeInput {
  return {
    id,
    isSource: false,
    isCustomer: false,
    switchable: false,
    energized: true,
    topologyLevel: 5,
    ...overrides,
  };
}

function edge(fromId: string, toId: string, overrides: Partial<GraphEdgeInput> = {}): GraphEdgeInput {
  return { fromId, toId, isClosed: true, normallyOpen: false, inOutageGraph: true, ...overrides };
}

function buildTestGraph() {
  const nodes: GraphNodeInput[] = [
    node('TM', { isSource: true, topologyLevel: 0 }),
    node('brk1', { switchable: true, topologyLevel: 1 }),
    node('dm', { topologyLevel: 2 }),
    node('brk2', { switchable: true, topologyLevel: 3 }),
    node('trafo', { topologyLevel: 4 }),
    node('lvj', { topologyLevel: 5 }),
    node('kofraBrk', { switchable: true, topologyLevel: 6 }),
    node('ev', { isCustomer: true, topologyLevel: 127 }),
    node('ada', { topologyLevel: 9 }),
  ];

  const edges: GraphEdgeInput[] = [
    edge('TM', 'brk1'),
    edge('brk1', 'dm'),
    edge('dm', 'brk2'),
    edge('brk2', 'trafo'),
    edge('trafo', 'lvj'),
    edge('lvj', 'kofraBrk'),
    edge('kofraBrk', 'ev'),
    // Normalde açık tie: tabanda da erişilemez, enerjisiz SAYILMAMALI.
    edge('TM', 'ada', { isClosed: false, normallyOpen: true }),
  ];

  return buildCsr(nodes, edges);
}

const graph = buildTestGraph();
const baseline = computeBaseline(graph);

function deEnergizedIds(roots: CutRoot[]): string[] {
  const state = recompute(graph, baseline, roots, 1);
  return graph.nodeIds.filter((_, idx) => state.deEnergized[idx] === 1);
}

function causeOf(roots: CutRoot[], componentId: string): string | null {
  const state = recompute(graph, baseline, roots, 1);
  const idx = graph.nodeIndex.get(componentId)!;
  const slot = state.cause[idx]!;
  return slot < 0 ? null : (state.causeOutageIds[slot] ?? null);
}

describe('enerjilenme motoru', () => {
  it('kesinti yokken enerjisiz küme boştur (tie ve mesh tabanda sayılmaz)', () => {
    expect(deEnergizedIds([])).toEqual([]);
  });

  it('normalde açık tie ardındaki düğüm tabanda zaten erişilemez sayılır', () => {
    // Taban çizgisinin kendisi 'ada'yı erişilmiş göstermemeli.
    const adaIdx = graph.nodeIndex.get('ada')!;
    expect(baseline[adaIdx]).toBe(0);
  });

  it('kesici (BARRIER) kesintisinde kesicinin kendisi enerjili, altı enerjisiz kalır', () => {
    const ids = deEnergizedIds([{ componentId: 'brk1', outageId: 'o1', kind: 'BARRIER' }]);

    expect(ids).not.toContain('brk1');
    expect(ids).toEqual(expect.arrayContaining(['dm', 'brk2', 'trafo', 'lvj', 'kofraBrk', 'ev']));
  });

  it('kesici olmayan eleman (DEAD) kesintisinde elemanın kendisi de enerjisizdir', () => {
    const ids = deEnergizedIds([{ componentId: 'trafo', outageId: 'o1', kind: 'DEAD' }]);

    expect(ids).toContain('trafo');
    expect(ids).toEqual(expect.arrayContaining(['lvj', 'kofraBrk', 'ev']));
    expect(ids).not.toContain('dm');
  });

  it('kofra kesicisi kesildiğinde kofra barası enerjili kalır, yalnız ev kararır', () => {
    const ids = deEnergizedIds([{ componentId: 'kofraBrk', outageId: 'o1', kind: 'BARRIER' }]);

    expect(ids).toEqual(['ev']);
    expect(ids).not.toContain('lvj');
  });

  it('abone ve eleman sayıları ayrı sayılır', () => {
    const state = recompute(graph, baseline, [{ componentId: 'trafo', outageId: 'o1', kind: 'DEAD' }], 1);

    expect(state.deEnergizedCustomerCount).toBe(1); // ev
    expect(state.deEnergizedCount).toBe(3); // trafo, lvj, kofraBrk — abone bu sayıya girmez
  });

  it('üst üste binen iki kesintide alttaki iptal edilince bölge karanlık kalır', () => {
    const both: CutRoot[] = [
      { componentId: 'brk1', outageId: 'ust', kind: 'BARRIER' },
      { componentId: 'trafo', outageId: 'alt', kind: 'DEAD' },
    ];
    const onlyUpper: CutRoot[] = [{ componentId: 'brk1', outageId: 'ust', kind: 'BARRIER' }];

    // Alttaki kesinti iptal edildi; üstteki hâlâ karartıyor.
    expect(deEnergizedIds(onlyUpper)).toEqual(expect.arrayContaining(['trafo', 'lvj', 'ev']));
    expect(deEnergizedIds(both)).toEqual(deEnergizedIds(onlyUpper));
  });

  it('aynı cut kümesi iki kez uygulanınca sonuç değişmez (idempotent)', () => {
    const roots: CutRoot[] = [{ componentId: 'brk2', outageId: 'o1', kind: 'BARRIER' }];
    const first = recompute(graph, baseline, roots, 1);
    const second = recompute(graph, baseline, roots, 2);

    expect(Array.from(second.deEnergized)).toEqual(Array.from(first.deEnergized));
    expect(second.deEnergizedCount).toBe(first.deEnergizedCount);
  });

  it('sebep etiketinde kaynağa en yakın kesinti kazanır', () => {
    const roots: CutRoot[] = [
      { componentId: 'trafo', outageId: 'alt', kind: 'DEAD' },
      { componentId: 'brk1', outageId: 'ust', kind: 'BARRIER' },
    ];

    // Kökler topoloji seviyesine göre sıralanır; 'ust' (level 1) 'alt'tan (level 4) önce gelir.
    expect(causeOf(roots, 'ev')).toBe('ust');
    expect(causeOf(roots, 'dm')).toBe('ust');
  });

  it('sebebi olmayan bir enerjili düğümün etiketi yoktur', () => {
    const roots: CutRoot[] = [{ componentId: 'kofraBrk', outageId: 'o1', kind: 'BARRIER' }];

    expect(causeOf(roots, 'ev')).toBe('o1');
    expect(causeOf(roots, 'lvj')).toBeNull();
  });

  it('TM üzerine DEAD kesinti tüm şebekeyi karartır', () => {
    const ids = deEnergizedIds([{ componentId: 'TM', outageId: 'o1', kind: 'DEAD' }]);

    expect(ids).toContain('TM');
    expect(ids).toContain('ev');
    // Tabanda zaten erişilemeyen 'ada' yine sayılmaz.
    expect(ids).not.toContain('ada');
  });
});
