/** Geçerli kesinti durumları listesi. */
export const OUTAGE_STATUSES = ['STARTED', 'ENERGIZED', 'ARCHIVED', 'CANCELLED'] as const;
export type OutageStatus = (typeof OUTAGE_STATUSES)[number];

/** Kesinti türü: önceden planlanmış çalışma mı, arıza mı. */
export const OUTAGE_KINDS = ['PLANNED', 'UNPLANNED'] as const;
export type OutageKind = (typeof OUTAGE_KINDS)[number];

/** Etki hesabının durumu — kesinti açıldığında `PENDING`, olay dönünce `CALCULATED`. */
export type OutageImpactStatus = 'PENDING' | 'CALCULATED' | 'UNAVAILABLE';

export interface Outage {
  id: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  status: OutageStatus;
  kind: OutageKind;
  workOrderId: string | null;
  /** Kesintinin bağlandığı şebeke elemanı — geçerli bir CBS kimliğidir, serbest metin değil. */
  cbsId: string;
  unitPath: string;
  componentType: string;
  componentName: string | null;
  topologyLevel: number;
  affectedCustomerCount: number | null;
  impactStatus: OutageImpactStatus;
  /** Bu kesintiyi kapsayan üst kesinti — doluysa müşteri-dakika burada sayılmaz. */
  parentOutageId: string | null;
  customerMinutes: number | null;
  origin: 'USER' | 'SYSTEM';
  createdBy: string;
  version: number;
}

export interface OutageFilters {
  status?: OutageStatus[];
  cbsId?: string;
  /** İdari birim alt ağacı — `TR.06.012` altındaki tüm kesintiler. */
  unitPath?: string;
  componentType?: string[];
  startedAtFrom?: string;
  startedAtTo?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  endedAtFrom?: string;
  endedAtTo?: string;
  durationMinMinutes?: number;
  durationMaxMinutes?: number;
  /** Etki eşiği: etkilenen abone sayısı ≥ N. */
  minAffectedCustomers?: number;
  maxAffectedCustomers?: number;
  origin?: ('USER' | 'SYSTEM')[];
  hasWorkOrder?: boolean;
}

export interface CreateOutageInput {
  cbsId: string;
  startedAt: string;
  endedAt?: string;
  kind?: OutageKind;
}

export interface OutageHistoryEntry {
  id: string;
  changedAt: string;
  fromStatus: OutageStatus | null;
  toStatus: OutageStatus;
  actor: string;
  origin: 'USER' | 'SYSTEM';
}

/** Kesintinin etkilediği abone — **PII içermez** (tesisat/sözleşme bilgisi taşımaz). */
export interface OutageAffectedCustomer {
  customerId: string;
  unitPath: string;
  customerType: string | null;
}

/** Etki anlık görüntüsü (`/outages/:id/impact`). */
export interface OutageImpact {
  outageId: string;
  revision: number;
  affectedElementIds: string[];
  affectedElementCount: number;
  affectedCustomerCount: number;
  overflowed: boolean;
  radialityViolated: boolean;
  calculatedAt: string;
}

/** Harita katmanının çizdiği hafif kesinti özeti (`/outages/map`). */
export interface OutageMapItem {
  id: string;
  cbsId: string;
  status: OutageStatus;
  kind: OutageKind;
  componentType: string;
  /** Kesici rolü — katmanın zoom eşiği bundan türer (kofra kesintisi z16,5'te açılır). */
  breakerRole: string | null;
  unitPath: string;
  unitName: string | null;
  districtName: string | null;
  startedAt: string;
  endedAt: string | null;
  affectedCustomerCount: number | null;
  parentOutageId: string | null;
  workOrderId: string | null;
  lat: number;
  lon: number;
}
