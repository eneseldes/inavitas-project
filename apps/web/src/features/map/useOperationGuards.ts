import { useAuth } from '../auth/useAuth.tsx';
import { useOutages } from '../outages/useOutages.ts';
import { useWorkOrders } from '../work-orders/useWorkOrders.ts';
import type { ChildOutage } from '../../types/network.ts';
import { useComponent, useImpactPreview } from './useNetwork.ts';

/** Kesinti açılmasını engelleyen sebep — arayüz mesajı bundan seçilir. */
export type OutageBlockReason = 'DE_ENERGIZED' | 'ALREADY_ACTIVE';

export interface OperationGuards {
  /** Elemanın şu anki enerjilenme durumu; bilinmiyorsa (yetki yok / yüklenmedi) `true`. */
  isEnergized: boolean;
  /** Elemanı karartan kesinti — "hangi kesinti yüzünden" bağlantısı buradan verilir. */
  deEnergizedBy: string | null;
  /** Elemanın **kendi üzerinde** süren kesinti. */
  activeOutageOnSelf: string | undefined;
  /** Elemanın **kendi üzerinde** süren iş emri. */
  activeWorkOrderOnSelf: string | undefined;
  /**
   * Beslediği hatta süren kesintiler (kaskad onayı) — liste sunucuda kırpılır.
   * Yalnız `withCascade` istendiğinde doludur; aksi hâlde boştur (bkz. üstteki not).
   */
  childOutages: ChildOutage[];
  /** Kırpılmamış toplam alt kesinti sayısı. */
  childOutageCount: number;
  outageBlocked: boolean;
  outageBlockReason: OutageBlockReason | undefined;
  workOrderBlocked: boolean;
  isLoading: boolean;
}

/** Bitmemiş iş emri durumları — sunucudaki kapıyla aynı küme. */
const ACTIVE_WORK_ORDER_STATUSES = ['STARTED', 'ASSIGNED', 'IN_PROGRESS', 'ENERGIZED'] as const;

/** Kapı sorgusu tek satır ister; sıralama önemsizdir ama uç zorunlu tutuyor. */
const SORT = { field: 'createdAt', dir: 'desc' } as const;

/**
 * Kesinti/iş emri açma kapılarının **tek** istemci tarafı kaynağı.
 *
 * Hem haritadaki `CreateOperationDialog` hem panellerdeki `CreateOutageDialog` /
 * `CreateWorkOrderDialog` bunu kullanır — kapı mantığı iki yerde ayrı yazılırsa biri
 * güncellenmeyi unutur ve arayüz sunucuyla çelişir.
 *
 * **Kapı sunucudadır, bu yalnız erken gösterimdir.** `network:read` izni olmayan bir
 * kullanıcı eleman detayını çağıramaz; hook o durumda **sessizce serbest** döner ve kullanıcı
 * 409 mesajını denemeden sonra görür. Yetkisizliği "engel" saymak, `network:read` olmayan ama
 * `outage:write` olan bir kullanıcıyı tamamen kilitlerdi.
 *
 * ⚠️ **Enerjilenme `/components/:id`'den okunur, `/impact-preview`'dan değil.** İkisi de
 * `isEnergized`/`deEnergizedBy` döndürür ama biri bellek-içi O(1) sözlük araması, diğeri tüm
 * aşağı akışı gezen bir BFS. Eskiden kapılar önizlemeyi okuduğu için haritada bir TM'e
 * tıklamak on binlerce düğümlük bir gezinme başlatıyordu — üstelik seçim zaten `useComponent`
 * ile aynı elemanı ayrıca çekiyordu. Önizleme artık YALNIZ `withCascade` istendiğinde
 * (kayıt açma modali açıkken) bağlanır; alt kesinti listesi de zaten sadece orada gösteriliyor.
 */
export function useOperationGuards(
  cbsId: string | undefined,
  options?: { withCascade?: boolean },
): OperationGuards {
  const { hasPermission } = useAuth();

  // İzni olmayan kullanıcıda sorgu hiç açılmaz: hem boşuna 403 üretmez, hem de eksik veri
  // "engel yok" olarak yorumlanır (bkz. üstteki not).
  const canReadNetwork = hasPermission('network:read');
  const canReadOutages = hasPermission('outage:read');
  const canReadWorkOrders = hasPermission('workorder:read');

  // Seçili elemanın detayı zaten çekiliyor (DetailPanel / MapPage) — aynı sorgu anahtarı,
  // ek istek yok.
  const { data: component, isLoading: isComponentLoading } = useComponent(
    canReadNetwork ? cbsId : undefined,
  );
  const { data: preview, isLoading: isPreviewLoading } = useImpactPreview(
    canReadNetwork && options?.withCascade ? cbsId : undefined,
  );

  // Mevcut liste sorguları `cbsId` filtresini zaten destekliyor; kapı için yeni bir uç açılmaz.
  const { data: outages, isLoading: isOutagesLoading } = useOutages(
    { page: 1, pageSize: 1, sort: SORT, filters: { cbsId, status: ['STARTED'] } },
    cbsId !== undefined && canReadOutages,
  );
  const { data: workOrders, isLoading: isWorkOrdersLoading } = useWorkOrders(
    { page: 1, pageSize: 1, sort: SORT, filters: { cbsId, status: [...ACTIVE_WORK_ORDER_STATUSES] } },
    cbsId !== undefined && canReadWorkOrders,
  );

  const activeOutageOnSelf = outages?.items[0]?.id;
  const activeWorkOrderOnSelf = workOrders?.items[0]?.id;

  // Detay gelmediyse (yetki yok, yükleniyor, hata) enerjili varsayılır — bkz. üstteki not.
  const isEnergized = component?.isEnergized ?? true;
  const deEnergizedBy = component?.deEnergizedBy ?? null;

  // Sıra önemli: "kendi üzerinde kesinti var" daha spesifik bir cevaptır, sunucudaki
  // kapı sırasıyla aynı tutulur.
  const outageBlockReason: OutageBlockReason | undefined = activeOutageOnSelf
    ? 'ALREADY_ACTIVE'
    : !isEnergized
      ? 'DE_ENERGIZED'
      : undefined;

  return {
    isEnergized,
    deEnergizedBy,
    activeOutageOnSelf,
    activeWorkOrderOnSelf,
    childOutages: preview?.childOutages ?? [],
    childOutageCount: preview?.childOutageCount ?? 0,
    outageBlocked: outageBlockReason !== undefined,
    outageBlockReason,
    // İş emri enerjisizlik nedeniyle engellenmez: enerjisi kesik elemana iş emri açmak
    // zaten onarımın kendisidir. Engel yalnız "zaten aktif iş emri var" durumudur.
    workOrderBlocked: activeWorkOrderOnSelf !== undefined,
    isLoading: isComponentLoading || isPreviewLoading || isOutagesLoading || isWorkOrdersLoading,
  };
}
