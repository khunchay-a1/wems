import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { resolveLocale } from '../i18n/locale';
import { RequestContext } from './request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { id?: unknown }, _res: Response, next: NextFunction): void {
    RequestContext.run(
      {
        requestId: typeof req.id === 'string' ? req.id : undefined,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 500),
        locale: resolveLocale(req.headers['accept-language']),
      },
      next,
    );
  }
}
