/**
 * Kesinti durum makinesi — SRS 1.6.
 *
 * Framework'ten bağımsız saf mantık: Express/Drizzle bilmez, milisaniyelerde
 * test edilir (02-MIMARI 2.8). Geçersiz geçişler API'de 409 Conflict ile
 * reddedilir; bu kural yalnızca burada yaşar, controller'a dağılmaz.
 */

export const OUTAGE_STATUSES = ['STARTED', 'ENERGIZED', 'ARCHIVED', 'CANCELLED'] as const;
export type OutageStatus = (typeof OUTAGE_STATUSES)[number];

const TRANSITIONS: Record<OutageStatus, OutageStatus[]> = {
  STARTED: ['ENERGIZED', 'CANCELLED'],
  ENERGIZED: ['ARCHIVED', 'CANCELLED'],
  ARCHIVED: ['CANCELLED'],
  CANCELLED: [], // terminal durum, çıkış yok
};

export const canTransition = (from: OutageStatus, to: OutageStatus): boolean => TRANSITIONS[from].includes(to);
