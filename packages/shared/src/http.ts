import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import type { AuthedRequest } from './auth.ts';
import { AppError, ValidationError, toErrorResponse, type ErrorDetail } from './errors.ts';
import { newCorrelationId, withCorrelation, type Logger } from './logger.ts';

export const CORRELATION_HEADER = 'x-correlation-id';

/** Express Request arayüzüne Pino HTTP logger tipini ekler. */
declare module 'http' {
  interface IncomingMessage {
    log: Logger;
  }
}

/**
 * Gelen HTTP isteğine correlationId atar (veya var olanı korur) ve yanıt header'ına ekler.
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
 * HTTP istek ve yanıtlarını loglayan middleware.
 * Sağlık kontrollerini loglardan muaf tutar ve yanıt koduna göre log seviyesini belirler.
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

/** Asenkron route handler fonksiyonlarındaki yakalanmayan hataları Express hata yakalayıcısına iletir. */
export function asyncHandler<T extends Request = Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req as unknown as T, res, next).catch(next);
  };
}

/** Zod doğrulama hatasını API ErrorDetail formatına dönüştürür. */
function zodToDetails(err: ZodError): ErrorDetail[] {
  return err.issues.map((issue) => ({
    field: issue.path.join('.') || '(kök)',
    issue: issue.message,
  }));
}

/**
 * Merkezi Express hata yakalama middleware'i.
 * Zod ve AppError türündeki hataları uygun HTTP yanıt kodları ile döndürür.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const correlationId = (req as AuthedRequest).correlationId ?? 'yok';
    const log = withCorrelation(logger, correlationId);

    const error = err instanceof ZodError ? new ValidationError('Girdi doğrulaması başarısız', zodToDetails(err)) : err;

    if (error instanceof AppError) {
      const level = error.statusCode >= 500 ? 'error' : 'debug';
      log[level]({ err: error, code: error.code }, error.message);
      res.status(error.statusCode).json(error.toResponse(correlationId));
      return;
    }

    log.error({ err: error }, 'beklenmeyen hata');
    res.status(500).json(toErrorResponse(error, correlationId));
  };
}

/** Tanımlanmamış uç noktalar için 404 yanıtı üreten middleware. */
export function notFoundHandler(): RequestHandler {
  return (req, _res, next) => {
    next(new AppError('NOT_FOUND', `Böyle bir uç nokta yok: ${req.method} ${req.path}`));
  };
}
