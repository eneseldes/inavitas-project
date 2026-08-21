/**
 * Servisler arası ortak HTTP hata kodları ve hata nesneleri.
 */

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  /** Elemanın enerjisi hâlihazırda kesik; üzerine yeni kesinti açılamaz. */
  COMPONENT_DE_ENERGIZED: 409,
  /** Bu elemanda süren (STARTED) bir kesinti zaten var. */
  OUTAGE_ALREADY_ACTIVE: 409,
  /** Bu elemanda süren (DONE/CANCELLED olmayan) bir iş emri zaten var. */
  WORK_ORDER_ALREADY_ACTIVE: 409,
  /** Hedef eleman kullanıcının bölgesel yetki kapsamı dışında. */
  OUT_OF_SCOPE: 403,
  /** Token'daki kapsam kümesi bayat — yenilenmesi gerekiyor. */
  SCOPE_STALE: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Hata detay alanı (ör. form/girdi doğrulama hatalarında). */
export interface ErrorDetail {
  field: string;
  issue: string;
  /**
   * Engelin sebebi olan kesinti/iş emri kimliği. Arayüz "hangi kayıt yüzünden engellendim"
   * sorusunu bu alandan cevaplar ve o kayda bağlantı verir (bkz. 409 kapıları).
   */
  blockedBy?: string;
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
 * Hedef eleman kullanıcının bölgesel yetki kapsamı dışındayken fırlatılır.
 *
 * Okuma yollarında kapsam bir **süzgeçtir** (kayıt hiç görünmez); yazma yollarında bir
 * **kapıdır** — istemci listeden geçmeden de istek atabileceği için karar kayıt anında
 * yeniden verilir.
 */
export class OutOfScopeError extends AppError {
  constructor(resourceId: string, unitPath: string) {
    super('OUT_OF_SCOPE', `Bu kayıt yetki kapsamınızın dışında: ${resourceId} (${unitPath})`, {
      details: [{ field: 'cbsId', issue: 'OUT_OF_SCOPE' }],
    });
  }
}

/**
 * Token'daki kapsam kümesi, kullanıcının güncel kapsamından eski olduğunda fırlatılır.
 * İstemci bunu bir oturum yenileme işareti olarak okur: token tazelenir ve önbellek
 * tamamen boşaltılır — daraltılmış kapsamda eski kayıtlar önbellekte asılı kalmasın.
 */
export class ScopeStaleError extends AppError {
  constructor() {
    super('SCOPE_STALE', 'Yetki kapsamınız değişti, oturum yenilenmeli');
  }
}

/**
 * Enerjisi hâlihazırda kesik bir elemana yeni kesinti açılmaya çalışıldığında fırlatılır.
 * Kapı sunucudadır; arayüz onu yalnız erkenden ve anlaşılır biçimde gösterir.
 */
export class ComponentDeEnergizedError extends AppError {
  constructor(cbsId: string, blockingOutageId: string) {
    super('COMPONENT_DE_ENERGIZED', `Şebeke elemanının elektriği hâlihazırda kesik: ${cbsId}`, {
      details: [{ field: 'cbsId', issue: 'DE_ENERGIZED', blockedBy: blockingOutageId }],
    });
  }
}

/** Aynı elemanda süren bir kesinti varken ikinci kesinti açılmaya çalışıldığında fırlatılır. */
export class OutageAlreadyActiveError extends AppError {
  constructor(cbsId: string, activeOutageId: string) {
    super('OUTAGE_ALREADY_ACTIVE', `Şebeke elemanında süren bir kesinti zaten var: ${cbsId}`, {
      details: [{ field: 'cbsId', issue: 'OUTAGE_ALREADY_ACTIVE', blockedBy: activeOutageId }],
    });
  }
}

/** Aynı elemanda süren bir iş emri varken ikinci iş emri açılmaya çalışıldığında fırlatılır. */
export class WorkOrderAlreadyActiveError extends AppError {
  constructor(cbsId: string, activeWorkOrderId: string) {
    super('WORK_ORDER_ALREADY_ACTIVE', `Şebeke elemanında süren bir iş emri zaten var: ${cbsId}`, {
      details: [
        { field: 'cbsId', issue: 'WORK_ORDER_ALREADY_ACTIVE', blockedBy: activeWorkOrderId },
      ],
    });
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
