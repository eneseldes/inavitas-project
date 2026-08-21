import type { QueryClient } from '@tanstack/react-query';

/**
 * SSE olaylarının harita katmanına **hedefli** uygulanması.
 *
 * Sorun: harita kaynağı (`/outages/map`, `/work-orders/map`) filtreye uyan tüm kayıtları tek
 * dizi olarak tutar. Her SSE olayında bu sorguyu `invalidateQueries` ile tazelemek bir ağ
 * isteği **ve** MapLibre kaynağının `setData` ile baştan kurulması demekti; toplu bir durum
 * değişikliğinde (N kesintinin durumu arka arkaya değişince) harita N kez sıfırlanıyordu. Debounce yalnız
 * burst'leri tekilleştiriyordu, isteği ortadan kaldırmıyordu.
 *
 * Çözüm: sunucu zaten `{ id, cbsId, status, unitPath }` gönderiyor. Kayıt önbellekte varsa
 * durumu **yerinde** yamanır — hiç ağ isteği yok. Yalnız iki durumda tazeleme gerekir:
 * - olayın kimliği önbellekte YOK (yeni kayıt; konumu ve abone sayısı bilinmiyor),
 * - kaydın yeni durumu artık filtreye uymuyor ve listeden düşmesi gerekiyor
 *   (bu, yerinde çıkarmayla da yapılabilir; sayı/`truncated` tutarlılığı için tazelenir).
 */

/** SSE mesajının harita için anlamlı olan parçası. */
export interface StatusEvent {
  id: string;
  status: string;
}

interface MapPayload<T> {
  items: T[];
  truncated: boolean;
}

/**
 * Harita sorgularını yerinde yamar; tazeleme gerekiyorsa `true` döner.
 *
 * `queryKey` deseni `[featureKey, 'map', filters]`; filtreler anahtarın üçüncü parçasıdır ve
 * `status` süzgeci oradan okunur — kaydın yeni durumu artık seçili değilse haritadan düşmeli.
 */
export function patchMapQueries<T extends { id: string; status: string }>(
  queryClient: QueryClient,
  featureKey: string,
  events: StatusEvent[],
): boolean {
  if (events.length === 0) return false;

  const byId = new Map(events.map((event) => [event.id, event.status]));
  const entries = queryClient.getQueriesData<MapPayload<T>>({ queryKey: [featureKey, 'map'] });

  // Hiç harita sorgusu yoksa (harita ekranı kapalı) yamanacak bir şey de yok; tazeleme de
  // gerekmez — sorgu bir sonraki açılışta zaten taze çekilir.
  if (entries.length === 0) return false;

  let needsRefetch = false;

  for (const [queryKey, data] of entries) {
    if (!data) continue;

    const statusFilter = (queryKey[2] as { status?: string[] } | undefined)?.status;
    const known = new Set(data.items.map((item) => item.id));

    // Tazeleme YALNIZ "bu kayıt haritada olmalı ama önbellekte yok" durumunda gerekir.
    // Eskiden koşul sadece "önbellekte yok"tu ve bu, filtre DIŞINDAKİ her kayıt için de
    // doğruydu: başka bir ilçedeki bir kesintinin iptal edilmesi bile `/outages/map`in
    // tamamını yeniden çektiriyordu. Yeni durum süzgece uymuyorsa kayıt zaten listede
    // olmamalı — çekilecek bir şey yok.
    for (const [id, status] of byId) {
      if (known.has(id)) continue;
      if (statusFilter && !statusFilter.includes(status)) continue;
      needsRefetch = true;
    }

    let changed = false;
    const next: T[] = [];
    for (const item of data.items) {
      const status = byId.get(item.id);
      if (status === undefined || status === item.status) {
        next.push(item);
        continue;
      }
      changed = true;
      // Yeni durum filtre dışındaysa kayıt listeden düşer; içindeyse yalnız durumu değişir.
      if (statusFilter && !statusFilter.includes(status)) continue;
      next.push({ ...item, status } as T);
    }

    if (changed) queryClient.setQueryData<MapPayload<T>>(queryKey, { ...data, items: next });
  }

  return needsRefetch;
}
