import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { errorMessage, resolveLocale } from '../i18n/locale';
import type { ErrorCode } from './error-codes';
import { Problem } from './problem';

const ERROR_TYPE_BASE = 'https://wems.local/errors/';

function httpStatusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'DUPLICATE';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_FILE_TYPE';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}

/** Converts any thrown error into application/problem+json (docs/04-api-conventions.md §5). */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    if (res.headersSent) return;

    const problem = this.toProblem(exception);
    const locale = resolveLocale(req.headers['accept-language']);
    const msg = errorMessage(problem.code, locale);
    const requestId = typeof req.id === 'string' ? req.id : undefined;

    if (problem.status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }

    const body: Record<string, unknown> = {
      type: `${ERROR_TYPE_BASE}${problem.code}`,
      title: msg.title,
      status: problem.status,
      detail: problem.options.detail ?? msg.detail,
      instance: req.originalUrl,
      code: problem.code,
      ...(problem.options.rule ? { rule: problem.options.rule } : {}),
      ...(problem.options.errors?.length ? { errors: problem.options.errors } : {}),
      ...(problem.options.extra ?? {}),
      requestId,
    };
    for (const [k, v] of Object.entries(problem.options.headers ?? {})) res.setHeader(k, v);
    res.status(problem.status).type('application/problem+json').send(JSON.stringify(body));
  }

  private toProblem(exception: unknown): Problem {
    if (exception instanceof Problem) return exception;
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return new Problem('DUPLICATE');
      if (exception.code === 'P2025') return new Problem('NOT_FOUND');
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = httpStatusToCode(status);
      if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
        return new Problem('RATE_LIMITED', { headers: { 'Retry-After': '60' } });
      }
      // body-parser JSON syntax errors arrive as 400 HttpException from Nest
      return new Problem(code);
    }
    const anyErr = exception as { type?: string; status?: number } | null;
    if (anyErr?.type === 'entity.too.large') return new Problem('PAYLOAD_TOO_LARGE');
    if (anyErr?.type === 'entity.parse.failed') return new Problem('VALIDATION_FAILED');
    return new Problem('INTERNAL_ERROR');
  }
}
