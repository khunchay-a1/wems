import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, type Observable, of, switchMap, tap, catchError, throwError } from 'rxjs';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { canonicalJson, sha256Hex } from '../crypto/crypto';
import { Problem } from '../errors/problem';
import { isUuid } from '../ids/uuid';
import { PrismaService } from '../prisma/prisma.service';
import { ClockService } from '../time/clock';

export const REQUIRE_IDEMPOTENCY = 'wems:requireIdempotency';
const TTL_MS = 24 * 60 * 60 * 1000;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MOBILE_EXEMPT = [/\/auth\//, /\/files\/upload-url$/];

/** Web actions that must not happen twice (submit, decision, send, issue) — docs/04-api-conventions.md §8. */
export const RequireIdempotencyKey = (): MethodDecorator => SetMetadata(REQUIRE_IDEMPOTENCY, true);

/**
 * Idempotency-Key support: same key + same body → replay the stored response; same key + different
 * body → 422 IDEMPOTENCY_KEY_REUSED; concurrent duplicate → 409 IDEMPOTENCY_IN_PROGRESS.
 * Mandatory for mobile POSTs and for routes marked @RequireIdempotencyKey.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const res = context.switchToHttp().getResponse<Response>();
    const user = req.user;
    if (!user || !MUTATING.has(req.method)) return next.handle();

    const header = req.headers['idempotency-key'];
    const key = typeof header === 'string' ? header.trim() : undefined;
    const required =
      this.reflector.get<boolean>(REQUIRE_IDEMPOTENCY, context.getHandler()) ||
      (req.method === 'POST' &&
        user.platform !== 'WEB' &&
        !MOBILE_EXEMPT.some((r) => r.test(req.path)));
    if (!key) {
      if (required) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'Idempotency-Key', code: 'REQUIRED' }],
        });
      }
      return next.handle();
    }
    if (!isUuid(key)) {
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'Idempotency-Key', code: 'INVALID_UUID' }],
      });
    }

    const requestHash = sha256Hex(
      `${req.method} ${req.originalUrl}\n${canonicalJson(req.body ?? null)}`,
    );
    const now = this.clock.now();

    return from(this.claim(user.id, key, req, requestHash, now)).pipe(
      switchMap((replay) => {
        if (replay) {
          res.status(replay.status);
          return of(replay.body);
        }
        return next.handle().pipe(
          tap((body: unknown) => {
            void this.prisma.idempotencyRecord
              .update({
                where: { userId_key: { userId: user.id, key } },
                data: {
                  responseStatus: res.statusCode,
                  responseBody: (body === undefined
                    ? null
                    : JSON.parse(JSON.stringify(body))) as Prisma.InputJsonValue,
                },
              })
              .catch(() => undefined);
          }),
          catchError((err: unknown) =>
            from(
              this.prisma.idempotencyRecord.deleteMany({ where: { userId: user.id, key } }),
            ).pipe(switchMap(() => throwError(() => err))),
          ),
        );
      }),
    );
  }

  /** Returns a stored response to replay, or null after reserving the key for this request. */
  private async claim(
    userId: string,
    key: string,
    req: Request,
    requestHash: string,
    now: Date,
  ): Promise<{ status: number; body: unknown } | null> {
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (existing && existing.expiresAt > now) {
      if (existing.requestHash !== requestHash) throw new Problem('IDEMPOTENCY_KEY_REUSED');
      if (existing.responseStatus === 0) throw new Problem('IDEMPOTENCY_IN_PROGRESS');
      return { status: existing.responseStatus, body: existing.responseBody };
    }
    if (existing)
      await this.prisma.idempotencyRecord.delete({ where: { userId_key: { userId, key } } });
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          key,
          method: req.method,
          path: req.originalUrl.slice(0, 500),
          requestHash,
          responseStatus: 0,
          createdAt: now,
          expiresAt: new Date(now.getTime() + TTL_MS),
        },
      });
    } catch {
      throw new Problem('IDEMPOTENCY_IN_PROGRESS');
    }
    return null;
  }
}
