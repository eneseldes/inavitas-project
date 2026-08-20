/**
 * Şebeke grafını Postgres'ten tek seferde okuyup belleğe CSR yapısı olarak yükler.
 *
 * Postgres kaynak-of-truth, bellek yalnız hız katmanıdır — anahtarlama durumu değişince yapı
 * baştan kurulmaz, kenar başına tek bit güncellenecek şekilde tasarlanmıştır.
 */

import type { Logger } from '@inavitas/shared';
import { sql } from 'drizzle-orm';
import { db } from '../db.ts';
import {
  buildCsr,
  computeSpanningParents,
  CUSTOMER_TOPOLOGY_LEVEL,
  type CsrGraph,
  type GraphEdgeInput,
  type GraphNodeInput,
} from './csr.ts';

let graph: CsrGraph | undefined;
let feederBreakersByTm: Map<string, string[]> = new Map();

/** Yüklenmiş grafı döner; henüz yüklenmediyse hata fırlatır. */
export function getGraph(): CsrGraph {
  if (!graph) throw new Error('Şebeke grafı henüz yüklenmedi — loadGraph() çağrılmadı');
  return graph;
}

/** `/ready` uç noktasının grafın yüklenip yüklenmediğini raporlaması için kullanılır. */
export function isGraphLoaded(): boolean {
  return graph !== undefined;
}

/**
 * TM kimliği → o TM'ye ait `TM_FEEDER` rolündeki kesicilerin kimlikleri.
 *
 * TM'nin kendisi `switchable=false`'tur; "TM'ye kesinti açmak" fiziksel olarak altındaki her
 * fider kesicisinin açılması demektir. Harita artık tek tek fider seçtirmediği için bu
 * genişletmeyi sunucu yapar. Tüm şebekede ~288 fider kesicisi vardır — harita önemsiz boyuttadır.
 */
export function getFeederBreakersOfTm(tmId: string): string[] {
  return feederBreakersByTm.get(tmId) ?? [];
}

interface ComponentNodeRow {
  id: string;
  type: string;
  switchable: boolean;
  is_energized: boolean;
  topology_level: number;
  breaker_role: string | null;
  tm_id: string | null;
}

interface CustomerNodeRow {
  id: string;
}

interface EdgeRow {
  from_id: string;
  to_id: string;
  is_closed: boolean;
  normally_open: boolean;
  participates_in_outage_graph: boolean;
}

/**
 * `network.components` ∪ `customer.customers` düğüm evrenini ve `network.topology_edges` kenar
 * kümesini okuyup CSR grafını kurar, TM köklerinden tek seferlik besleme-zinciri (`parent`)
 * hesabını yapar.
 */
export async function loadGraph(logger: Logger): Promise<void> {
  const startedAt = Date.now();

  const [componentRows, customerRows, edgeRows] = await Promise.all([
    db.execute(
      sql`SELECT id, type, switchable, is_energized, topology_level, breaker_role, tm_id FROM network.components`,
    ),
    db.execute(sql`SELECT id FROM customer.customers`),
    db.execute(
      sql`SELECT from_id, to_id, is_closed, normally_open, participates_in_outage_graph FROM network.topology_edges`,
    ),
  ]);

  const nodes: GraphNodeInput[] = [];
  const sourceIds: string[] = [];
  const feederMap = new Map<string, string[]>();

  for (const row of componentRows.rows as unknown as ComponentNodeRow[]) {
    const isSource = row.type === 'TM';
    if (isSource) sourceIds.push(row.id);

    // K10: TM'ye açılan kesinti bu haritadan N fider köküne genişletilir.
    if (row.breaker_role === 'TM_FEEDER' && row.tm_id) {
      const existing = feederMap.get(row.tm_id);
      if (existing) existing.push(row.id);
      else feederMap.set(row.tm_id, [row.id]);
    }

    nodes.push({
      id: row.id,
      isSource,
      isCustomer: false,
      switchable: row.switchable,
      energized: row.is_energized,
      topologyLevel: row.topology_level,
    });
  }

  for (const row of customerRows.rows as unknown as CustomerNodeRow[]) {
    nodes.push({
      id: row.id,
      isSource: false,
      isCustomer: true,
      switchable: false,
      energized: true,
      topologyLevel: CUSTOMER_TOPOLOGY_LEVEL,
    });
  }

  const edges: GraphEdgeInput[] = (edgeRows.rows as unknown as EdgeRow[]).map((row) => ({
    fromId: row.from_id,
    toId: row.to_id,
    isClosed: row.is_closed,
    normallyOpen: row.normally_open,
    inOutageGraph: row.participates_in_outage_graph,
  }));

  const built = buildCsr(nodes, edges);

  const sourceIndices: number[] = [];
  for (const id of sourceIds) {
    const idx = built.nodeIndex.get(id);
    if (idx !== undefined) sourceIndices.push(idx);
  }

  const reachedCount = computeSpanningParents(built, sourceIndices);

  graph = built;
  feederBreakersByTm = feederMap;

  const durationMs = Date.now() - startedAt;
  const memMb = Math.round(process.memoryUsage().heapUsed / (1024 * 1024));
  const unreachedCount = built.nodeIds.length - reachedCount;

  logger.info(
    {
      nodeCount: built.nodeIds.length,
      edgeCount: edges.length,
      sourceCount: sourceIndices.length,
      feederBreakerTmCount: feederMap.size,
      unreachedCount,
      durationMs,
      memMb,
    },
    'şebeke grafı belleğe yüklendi',
  );

  // Beklenen: normalde açık tie kesicileri/hatları (`is_closed=false`) ve kesinti grafına hiç
  // girmeyen HV mesh elemanları (`participates_in_outage_graph=false`) şu an kapalı bir yoldan
  // hiçbir TM'ye ulaşmaz — bu bir veri hatası değildir, ring topolojisinin normal halidir.
  logger.info({ unreachedCount }, 'TM kaynağından şu an kapalı yolla erişilemeyen düğüm sayısı (ties + HV mesh)');
}
