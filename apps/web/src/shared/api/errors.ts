import type { ApiErrorBody } from '../../types/api.ts';

/** Backend servislerinden gelen standart hata gövdesini ApiError nesnesine dönüştürür. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorBody['error']['details'];
  readonly correlationId?: string;

  constructor(status: number, code: string, message: string, details?: ApiErrorBody['error']['details'], correlationId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
  }
}

/** Ham `Response`i, gövdesi ne olursa olsun ApiError'a çevirir. */
export async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;

  if (body?.error) {
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details, body.error.correlationId);
  }

  return new ApiError(res.status, 'INTERNAL', 'Beklenmeyen bir hata oluştu');
}
