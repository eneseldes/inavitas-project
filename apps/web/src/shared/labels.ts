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

/** İş emri türü enum değerlerinin Türkçe karşılıkları. */
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

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Sistem Yöneticisi',
  OUTAGE_OPERATOR: 'Kesinti Yöneticisi',
  WORK_ORDER_OPERATOR: 'Saha Personeli',
};

export function formatRoles(roles?: string[]): string {
  if (!roles || roles.length === 0) return 'Kesinti Yöneticisi';
  return roles.map((r) => ROLE_LABELS[r] || r).join(', ');
}

export const ACTOR_NAME_MAP: Record<string, string> = {
  SYSTEM: 'Sistem Otomasyonu',
  'admin@inavitas.com': 'Ahmet Yılmaz',
  'kesinti@inavitas.com': 'Mehmet Demir',
  'isemri@inavitas.com': 'Ayşe Kaya',
};

export function formatActorName(actor: string | undefined): string {
  if (!actor) return 'Bilinmiyor';
  if (ACTOR_NAME_MAP[actor]) return ACTOR_NAME_MAP[actor];
  if (actor.includes('@')) {
    const namePart = actor.split('@')[0];
    return namePart
      .split(/[\._-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return actor;
}

