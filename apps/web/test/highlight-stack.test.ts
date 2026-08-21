import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_QUERY_SOURCE_ID,
  HIGHLIGHT_STATE_SOURCE_ID,
  highlightAnchors,
  highlightLayerIds,
} from '../src/features/map/highlightLayers.ts';
import { OUTAGE_HEATMAP_LAYER_ID, operationLayerIds, OUTAGE_SOURCE_ID } from '../src/features/map/operationLayers.ts';

/**
 * Vurgu katmanlarının **çizim sırası**.
 *
 * İki kural var ve ikisi de görsel olarak kritik:
 * 1. **İz (up/down) enerjisizlik hattının üstünde** — kullanıcının sorduğu sorunun cevabı,
 *    arka plandaki kalıcı durumun altında parça parça kesilmemeli.
 * 2. **İkisi de kesinti/iş emri rozetlerinin altında** — nokta işaretçisi üstünden geçen bir
 *    hat tarafından örtülmemeli.
 *
 * Bu sıra bir kez **sessizce ters dönmüştü**: iki çapa sabiti yer değiştirmiş, kodun kendi
 * yorumlarıyla çelişmişti ve hiçbir test bunu görmemişti. Test bunun için var.
 */

const ANCHORS = highlightAnchors(OUTAGE_HEATMAP_LAYER_ID);
const STATE_LAYERS = highlightLayerIds(HIGHLIGHT_STATE_SOURCE_ID);
const QUERY_LAYERS = highlightLayerIds(HIGHLIGHT_QUERY_SOURCE_ID);

/**
 * MapLibre'nin katman yığınının küçük bir taklidi. `addLayer(id, beforeId)` katmanı
 * `beforeId`'nin **altına** koyar; `beforeId` yoksa en üste ekler — gerçek davranışın aynısı.
 */
function createStack(initial: string[]): {
  layers: string[];
  add: (ids: readonly string[], anchors: readonly string[]) => void;
  remove: (ids: readonly string[]) => void;
} {
  const layers = [...initial];

  return {
    layers,
    add(ids, anchors) {
      const before = anchors.find((id) => layers.includes(id));
      const at = before ? layers.indexOf(before) : layers.length;
      layers.splice(at, 0, ...ids);
    },
    remove(ids) {
      for (const id of ids) {
        const at = layers.indexOf(id);
        if (at >= 0) layers.splice(at, 1);
      }
    },
  };
}

/** Temel yığın: şebeke katmanları, ısı haritası, en üstte kesinti rozetleri. */
function baseStack(): ReturnType<typeof createStack> {
  return createStack(['network-lines', 'network-nodes', OUTAGE_HEATMAP_LAYER_ID, ...operationLayerIds(OUTAGE_SOURCE_ID)]);
}

function indexOf(stack: { layers: string[] }, id: string): number {
  const at = stack.layers.indexOf(id);
  expect(at, `katman yığında yok: ${id}`).toBeGreaterThanOrEqual(0);
  return at;
}

/** İz enerjisizliğin üstünde, ikisi de rozetlerin altında mı. */
function expectCorrectOrder(stack: { layers: string[] }): void {
  const lastState = indexOf(stack, STATE_LAYERS.at(-1)!);
  const firstQuery = indexOf(stack, QUERY_LAYERS[0]!);
  const lastQuery = indexOf(stack, QUERY_LAYERS.at(-1)!);

  expect(firstQuery).toBeGreaterThan(lastState);
  expect(indexOf(stack, OUTAGE_HEATMAP_LAYER_ID)).toBeGreaterThan(lastQuery);
  expect(indexOf(stack, `${OUTAGE_SOURCE_ID}-marker`)).toBeGreaterThan(lastQuery);
}

describe('vurgu katmanı çizim sırası', () => {
  it('önce enerjisizlik kurulsa da iz üstte kalır', () => {
    // Kullanıcı haritayı açtı (kesinti var → state token'ı geldi), sonra bir elemana tıkladı.
    const stack = baseStack();
    stack.add(STATE_LAYERS, ANCHORS.state);
    stack.add(QUERY_LAYERS, ANCHORS.query);

    expectCorrectOrder(stack);
  });

  it('önce iz kurulsa da enerjisizlik altta kalır', () => {
    // Ters sıra: kullanıcı iz açtı, ardından bir kesinti doğdu ve state token'ı geldi.
    // Aday listesi olmasaydı state en üste eklenir ve izi örterdi.
    const stack = baseStack();
    stack.add(QUERY_LAYERS, ANCHORS.query);
    stack.add(STATE_LAYERS, ANCHORS.state);

    expectCorrectOrder(stack);
  });

  it('token değişince yeniden kurulan kaynak sırayı bozmaz', () => {
    // Enerjilenme sürümü her kesinti olayında artıyor: state kaynağı sökülüp yeniden kuruluyor.
    const stack = baseStack();
    stack.add(STATE_LAYERS, ANCHORS.state);
    stack.add(QUERY_LAYERS, ANCHORS.query);

    stack.remove(STATE_LAYERS);
    stack.add(STATE_LAYERS, ANCHORS.state);

    expectCorrectOrder(stack);
  });

  it('iz tek başınayken de rozetlerin altında kalır', () => {
    const stack = baseStack();
    stack.add(QUERY_LAYERS, ANCHORS.query);

    expect(indexOf(stack, `${OUTAGE_SOURCE_ID}-marker`)).toBeGreaterThan(indexOf(stack, QUERY_LAYERS.at(-1)!));
    expect(indexOf(stack, OUTAGE_HEATMAP_LAYER_ID)).toBeGreaterThan(indexOf(stack, QUERY_LAYERS.at(-1)!));
  });

  it('iz her zaman şebeke katmanlarının üstündedir', () => {
    const stack = baseStack();
    stack.add(STATE_LAYERS, ANCHORS.state);
    stack.add(QUERY_LAYERS, ANCHORS.query);

    expect(indexOf(stack, STATE_LAYERS[0]!)).toBeGreaterThan(indexOf(stack, 'network-nodes'));
  });

  it('ortak çapa ısı haritasıdır — iz rozetlerin üstüne çıkamaz', () => {
    // 🚨 Çapa rozet katmanına kaydırılırsa iz işaretçilerin üstüne çıkar. Sabit burada
    // açıkça yazılı ki değişiklik sessiz kalmasın.
    expect(ANCHORS.query).toEqual([OUTAGE_HEATMAP_LAYER_ID]);
    expect(ANCHORS.state.at(-1)).toBe(OUTAGE_HEATMAP_LAYER_ID);
  });
});
