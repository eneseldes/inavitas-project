/**
 * Servisler arası ortak HTTP hata kodları ve hata nesneleri.
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

/** Hata detay alanı (ör. form/girdi doğrulama hatalarında). */
export interface ErrorDetail {
  field: string;
  issue: string;
}

/** Standart API hata yanıtı yapısı. */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    correlationId: string;
  };
}

/** Temel uygulama hatası sınıfı. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: ErrorDetail[];
  /** Kafka tüketicilerinde yeniden denenebilirlik (retryability) durumunu belirtir. */
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

/** Çakışma veya geçersiz durum geçişi hatası. */
export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('CONFLICT', message, { details });
  }
}

/**
 * Kesinti/iş emri var olmayan bir CBS elemanına bağlanmaya çalışıldığında fırlatılır.
 * `gis_id` döneminde bu alanın tek doğrulaması uzunluğuydu ("asdasd" kabul ediliyordu);
 * artık `network_components_ro` read-model'inde karşılığı olmayan kimlik reddedilir.
 */
export class ComponentNotFoundError extends AppError {
  constructor(cbsId: string) {
    super('NOT_FOUND', `Şebeke elemanı bulunamadı: ${cbsId}`, {
      details: [{ field: 'cbsId', issue: 'COMPONENT_NOT_FOUND' }],
    });
  }
}

/**
 * Yüksek etkili bir kesinti (topoloji seviyesi ≤ {@link HIGH_IMPACT_TOPOLOGY_LEVEL}) ek izin
 * olmadan açılmaya çalışıldığında fırlatılır. Bir fider kesicisini açmak binlerce aboneyi
 * karartır; bu yüzden `outage:write` yetmez, ayrıca `outage:write-high-impact` aranır.
 */
export class HighImpactForbiddenError extends AppError {
  constructor(cbsId: string, topologyLevel: number) {
    super(
      'FORBIDDEN',
      `Yüksek etkili kesinti için ek izin gerekiyor (${cbsId}, topoloji seviyesi ${topologyLevel})`,
      { details: [{ field: 'cbsId', issue: 'HIGH_IMPACT_FORBIDDEN' }] },
    );
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
 * fırlatılan hatayı standart ErrorResponse formatına dönüştürür.
 * İç sistem detayları istemciye sızdırılmayacak şekilde işlenir.
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

/** Hataya göre Kafka işleminde yeniden deneme (retry) yapılıp yapılmayacağını belirler. */
export function isRetryable(err: unknown): boolean {
  return err instanceof AppError ? err.retryable : true;
}
