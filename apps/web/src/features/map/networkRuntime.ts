import type { QueryClient } from '@tanstack/react-query';
import { NETWORK_COMPONENT_KEY, NETWORK_ENERGIZATION_KEY, NETWORK_IMPACT_PREVIEW_KEY } from './useNetwork.ts';

/**
 * "Şebekenin işletim durumu değişti" — üç SSE akışının **ortak** tazeleme noktası.
 *
 * Neden ortak: tek bir kesinti açmak dört ayrı olay üretir (kesinti oluştu → otomatik iş emri
 * oluştu → enerjilenme yeniden hesaplandı → etki hesaplanınca kesinti güncellendi) ve bunlar
 * üç farklı SSE kanalından gelir. Üç kanal da eskiden **kendi** debounce penceresiyle **aynı**
 * iki sorguyu (`network-component`, `network-impact-preview`) tazeliyordu; pencereler
 * birbirini görmediği için aynı hesap ~1 saniye içinde dört kez yaptırılıyordu. Seçili eleman
 * bir TM ise bunun sunucudaki karşılığı dört kez on binlerce düğümlük graf gezinmesi.
 *
 * Zamanlayıcı **modül seviyesindedir**, hook başına değil — üç kanalın olayları tek pencerede
 * birleşsin diye. Bileşen sökülürken iptal edilmez: geç ateşlenen bir tazeleme, artık kimsenin
 * dinlemediği bir sorguyu geçersiz kılmaktan başka bir şey yapmaz.
 */
const RUNTIME_DEBOUNCE_MS = 300;

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Elemanın anlık işletim alanlarını taşıyan sorguları tazeler.
 *
 * `network-component` → `isEnergized` / `deEnergizedBy`.
 * `network-impact-preview` → yukarıdakiler + `childOutages` (yalnız kayıt açma modali açıkken
 * bağlanır — bkz. `useOperationGuards`).
 *
 * ⚠️ Enerjilenme özeti (`network-energization`) buraya **girmez**: onu yalnız enerjilenme
 * kanalı tetikler ve her tetiklenişinde haritanın vurgu kaynağı baştan kurulur. Kesinti/iş
 * emri kanallarından da tazelenirse harita gereksiz yere iki kez sıfırlanır.
 */
export function invalidateNetworkRuntime(queryClient: QueryClient): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void queryClient.invalidateQueries({ queryKey: [NETWORK_COMPONENT_KEY] });
    void queryClient.invalidateQueries({ queryKey: [NETWORK_IMPACT_PREVIEW_KEY] });
  }, RUNTIME_DEBOUNCE_MS);
}

/** Enerjilenme kanalının ek işi: vurgu kümesinin token'ını da tazeler. */
export function invalidateEnergization(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: [NETWORK_ENERGIZATION_KEY] });
}
