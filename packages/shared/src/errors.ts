/**
 * Tüm servislerin ortak hata sözleşmesi.
 *
 * Üç servis de aynı gövdeyi döndürdüğü için frontend'de tek bir hata
 * gösterici yazman yeterli olur.
 */

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Hata gövdesindeki alan bazlı ayrıntı. */
export interface ErrorDetail {
  field: string;
  issue: string;
}

/** API'nin döndürdüğü hata gövdesi. */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    correlationId: string;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: ErrorDetail[];
  /**
   * Kafka consumer'ında kullanılır: geçici hata mı (DB down → tekrar dene),
   * kalıcı hata mı (bozuk payload → doğrudan DLQ). Zehirli mesajın tüm
   * partition'ı bloklamasını bu ayrım engeller.
   */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetail[]; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.statusCode = ERROR_CODES[code];
    this.details = options.details;
    // Varsayılan: yalnızca sunucu hataları tekrar denenebilir.
    this.retryable = options.retryable ?? this.statusCode >= 500;
  }

  toResponse(correlationId: string): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
        correlationId,
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('VALIDATION_ERROR', message, { details });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Kimlik doğrulanamadı') {
    super('UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Bu işlem için yetkiniz yok') {
    super('FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', id ? `${resource} bulunamadı: ${id}` : `${resource} bulunamadı`);
  }
}

/** Geçersiz durum geçişi veya optimistic lock çakışması. */
export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('CONFLICT', message, { details });
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Çok fazla istek gönderildi, lütfen bekleyin') {
    super('RATE_LIMITED', message);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Beklenmeyen bir hata oluştu', cause?: unknown) {
    super('INTERNAL', message, { cause, retryable: true });
  }
}

/**
 * Bilinmeyen bir hatayı güvenli şekilde ErrorResponse'a çevirir.
 *
 * Beklenmeyen hataların mesajını istemciye SIZDIRMAZ — SQL hatası veya
 * dosya yolu içerebilir. Ayrıntı loglara gider, istemci genel mesaj görür.
 */
export function toErrorResponse(err: unknown, correlationId: string): ErrorResponse {
  if (err instanceof AppError) {
    return err.toResponse(correlationId);
  }
  return {
    error: {
      code: 'INTERNAL',
      message: 'Beklenmeyen bir hata oluştu',
      correlationId,
    },
  };
}

/** Bir hatanın tekrar denenebilir olup olmadığı. Consumer retry mantığı kullanır. */
export function isRetryable(err: unknown): boolean {
  return err instanceof AppError ? err.retryable : true;
}
