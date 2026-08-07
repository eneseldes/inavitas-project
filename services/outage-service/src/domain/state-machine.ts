/**
 * Kesinti durum makinesi ve durum geçiş kuralları.
 */

export const OUTAGE_STATUSES = ['STARTED', 'ENERGIZED', 'ARCHIVED', 'CANCELLED'] as const;
export type OutageStatus = (typeof OUTAGE_STATUSES)[number];

const TRANSITIONS: Record<OutageStatus, OutageStatus[]> = {
  STARTED: ['ENERGIZED', 'CANCELLED'],
  ENERGIZED: ['ARCHIVED', 'CANCELLED'],
  ARCHIVED: ['CANCELLED'],
  CANCELLED: [],
};

/** Mevcut durumdan yeni duruma geçişin geçerli olup olmadığını kontrol eder. */
export const canTransition = (from: OutageStatus, to: OutageStatus): boolean => TRANSITIONS[from].includes(to);
