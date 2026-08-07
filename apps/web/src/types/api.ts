/** Tüm liste uç noktalarının döndürdüğü standart zarf nesnesi. */
export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Standart API hata yanıtı gövdesi. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; issue: string }[];
    correlationId: string;
  };
}

export type SortDirection = 'asc' | 'desc';
