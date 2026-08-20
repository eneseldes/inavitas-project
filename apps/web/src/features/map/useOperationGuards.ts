import { useAuth } from '../auth/useAuth.tsx';
import { useOutages } from '../outages/useOutages.ts';
import { useWorkOrders } from '../work-orders/useWorkOrders.ts';
import type { ChildOutage } from '../../types/network.ts';
import { useImpactPreview } from './useNetwork.ts';

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
  /** Beslediği hatta süren kesintiler (kaskad onayı) — liste sunucuda kırpılır. */
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
 * kullanıcı `impact-preview` çağıramaz; hook o durumda **sessizce serbest** döner ve
 * kullanıcı 409 mesajını denemeden sonra görür. Yetkisizliği "engel" saymak, `network:read`
 * olmayan ama `outage:write` olan bir kullanıcıyı tamamen kilitlerdi.
 */
export function useOperationGuards(cbsId: string | undefined): OperationGuards {
  const { hasPermission } = useAuth();

  // İzni olmayan kullanıcıda sorgu hiç açılmaz: hem boşuna 403 üretmez, hem de eksik veri
  // "engel yok" olarak yorumlanır (bkz. üstteki not).
  const canReadNetwork = hasPermission('network:read');
  const canReadOutages = hasPermission('outage:read');
  const canReadWorkOrders = hasPermission('workorder:read');

  const { data: preview, isLoading: isPreviewLoading } = useImpactPreview(
    canReadNetwork ? cbsId : undefined,
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

  // Önizleme gelmediyse (yetki yok, yükleniyor, hata) enerjili varsayılır — bkz. üstteki not.
  const isEnergized = preview?.isEnergized ?? true;
  const deEnergizedBy = preview?.deEnergizedBy ?? null;

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
    isLoading: isPreviewLoading || isOutagesLoading || isWorkOrdersLoading,
  };
}
