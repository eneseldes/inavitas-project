import type { OutageStatus } from '../types/outage.ts';
import type { WorkOrderStatus, WorkOrderType } from '../types/work-order.ts';

/**
 * Tüm enum/type → görünen metin eşlemeleri TEK yerde.
 *
 * Backend enum değerleri (STARTED, BASIC_WORK, ...) İngilizce sabit kod
 * değerleridir, arayüzde asla ham haliyle gösterilmez — hepsi Türkçe
 * etikete çevrilir.
 */

export const OUTAGE_STATUS_LABELS: Record<OutageStatus, string> = {
  STARTED: 'Başladı',
  ENERGIZED: 'Enerji Verildi',
  ARCHIVED: 'Arşivlendi',
  CANCELLED: 'İptal Edildi',
};

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  STARTED: 'Başladı',
  ASSIGNED: 'Atandı',
  IN_PROGRESS: 'Devam Ediyor',
  ENERGIZED: 'Enerji Verildi',
  DONE: 'Tamamlandı',
  CANCELLED: 'İptal Edildi',
};

/** SRS 1.5 — work_order_db `wo_type` enum'ındaki Türkçe açıklamalarla birebir aynı. */
export const WORK_ORDER_TYPE_LABELS: Record<WorkOrderType, string> = {
  BASIC_WORK: 'Temel İş',
  LIGHTING_WORK_ORDER: 'Aydınlatma İş Emri',
  PLANNED_OUTAGE_WORK_ORDER: 'Planlı Kesinti İş Emri',
  UNPLANNED_OUTAGE_WORK_ORDER: 'Plansız Kesinti İş Emri',
  WITHOUT_OUTAGE_WORK_ORDER: 'Kesintisiz İş Emri',
};

export const ORIGIN_LABELS: Record<'USER' | 'SYSTEM', string> = {
  USER: 'Kullanıcı',
  SYSTEM: 'Sistem',
};
