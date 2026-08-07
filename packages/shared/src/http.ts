/**
 * Üç servisin de ortak kullandığı Express parçaları.
 *
 * Hata gövdesini tek yerden üretmek, frontend'de tek bir hata gösterici
 * yazabilmenin ön şartı (bkz. errors.ts).
 */

import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import type { AuthedRequest } from './auth.ts';
import { AppError, ValidationError, toErrorResponse, type ErrorDetail } from './errors.ts';
import { newCorrelationId, withCorrelation, type Logger } from './logger.ts';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * pino-http `req.log` alanını kendi `declare module 'http'` genişletmesiyle
 * ekliyor, ama bu genişletme yalnızca pino-http'i DOĞRUDAN import eden
 * dosyanın derleme kapsamına giriyor. `httpLogger`ı burada tek yerden
 * kurduğumuz için tüketici servisler artık pino-http'i import etmiyor —
 * genişletmeyi burada kendimiz açıkça tanımlıyoruz ki `req.log` her yerde
 * tip güvenli kalsın.
 */
declare module 'http' {
  interface IncomingMessage {
    log: Logger;
  }
}

/**
 * İsteğe correlationId iliştirir ve cevap header'ında geri yollar.
 *
 * Gelen istekte header varsa onu KORUR — zincirin gateway'de başlayıp
 * buraya kadar aynı id ile gelmesi tüm izlenebilirliğin dayandığı nokta.
 */
export function correlationMiddleware(): RequestHandler {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const incoming = req.header(CORRELATION_HEADER);
    const correlationId = incoming && incoming.trim() ? incoming.trim() : newCorrelationId();

    req.correlationId = correlationId;
    res.setHeader(CORRELATION_HEADER, correlationId);
    next();
  };
}

/**
 * Ortak istek/cevap logger'ı.
 *
 * pino-http'nin varsayılanı her istekte tüm header'ları ve `req`/`res`
 * nesnelerini dökerek konsolu kullanılmaz hale getiriyordu. Bunun yerine
 * `method url statusCode` özetleyen TEK satır basıyoruz; bu bilgi zaten
 * mesajın içinde olduğu için ayrıca `req`/`res` alanı da BASMIYORUZ —
 * aksi halde aynı bilginin iki kopyası tutulmuş olurdu. correlationId
 * `customProps` ile her logda zaten var.
 *
 * Başarılı (2xx/3xx) istekler `debug` seviyesinde: her sayfa açılışında/
 * listeleme isteğinde tekrar eden access-log satırları varsayılan `info`
 * görünümünü boğuyordu, asıl önemli olan iş olayları (örn. "kesinti
 * durumu değişti") ve hatalar kayboluyordu. 4xx/5xx `warn`/`error`'da
 * kalır, LOG_LEVEL=debug ile tüm trafik istendiğinde geri açılabilir.
 */
export function httpLogger(logger: Logger): RequestHandler {
  return (pinoHttp as any)({
    logger,
    genReqId: (req: AuthedRequest) => req.correlationId,
    customProps: (req: AuthedRequest) => ({ correlationId: req.correlationId }),
    autoLogging: { ignore: (req: Request) => req.url === '/health' || req.url === '/ready' },
    customLogLevel: (_req: Request, res: Response, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'debug';
    },
    customSuccessMessage: (req: Request, res: Response) => `${req.method} ${req.url} -> ${res.statusCode}`,
    customErrorMessage: (req: Request, res: Response, err: Error) =>
      `${req.method} ${req.url} -> ${res.statusCode} (${err.message})`,
    serializers: {
      req: () => undefined,
      res: () => undefined,
    },
  });
}

/** Route handler'lardaki async hataları Express'e taşır. */
export function asyncHandler<T extends Request = Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req as unknown as T, res, next).catch(next);
  };
}

/** Zod hatasını API'nin `ErrorDetail` biçimine çevirir. */
function zodToDetails(err: ZodError): ErrorDetail[] {
  return err.issues.map((issue) => ({
    field: issue.path.join('.') || '(kök)',
    issue: issue.message,
  }));
}

/**
 * Merkezi hata yakalayıcı. Express 5'te async handler'ların reddi de buraya düşer.
 *
 * Express bir middleware'i DÖRT parametreli olduğu için hata yakalayıcı sayar —
 * `next` kullanılmasa bile imzadan silme, yoksa sessizce normal middleware olur.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const correlationId = (req as AuthedRequest).correlationId ?? 'yok';
    const log = withCorrelation(logger, correlationId);

    // Zod hatasını 400'e çevir; ham ZodError istemciye gitmesin.
    const error = err instanceof ZodError ? new ValidationError('Girdi doğrulaması başarısız', zodToDetails(err)) : err;

    if (error instanceof AppError) {
      // Beklenen hatalar gürültü yapmasın: 4xx debug, 5xx error seviyesinde.
      const level = error.statusCode >= 500 ? 'error' : 'debug';
      log[level]({ err: error, code: error.code }, error.message);
      res.status(error.statusCode).json(error.toResponse(correlationId));
      return;
    }

    // Buraya düşen her şey beklenmeyen: tam ayrıntı loga, istemciye genel mesaj.
    log.error({ err: error }, 'beklenmeyen hata');
    res.status(500).json(toErrorResponse(error, correlationId));
  };
}

/** Tanımsız route için 404 — errorHandler'dan hemen ÖNCE ekle. */
export function notFoundHandler(): RequestHandler {
  return (req, _res, next) => {
    next(new AppError('NOT_FOUND', `Böyle bir uç nokta yok: ${req.method} ${req.path}`));
  };
}
