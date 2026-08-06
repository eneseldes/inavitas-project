/** Tüm liste uçlarının döndürdüğü sabit zarf (SRS 1.7). */
export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Standart hata gövdesi (SRS 1.7). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; issue: string }[];
    correlationId: string;
  };
}

export type SortDirection = 'asc' | 'desc';
