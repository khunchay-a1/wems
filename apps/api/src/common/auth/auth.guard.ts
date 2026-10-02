import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Problem } from '../errors/problem';
import { RequestContext } from '../http/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { ClockService } from '../time/clock';
import type { AuthUser } from './auth-user';
import { COOKIE_ACCESS, COOKIE_CSRF, CSRF_HEADER } from './cookies';
import { ALLOW_PENDING_PASSWORD_CHANGE, REQUIRED_PERMISSIONS, SKIP_CSRF } from './decorators';
import { isPermission, type Permission } from './permissions';
import { IS_PUBLIC } from './public.decorator';
import { safeEqual } from '../crypto/crypto';
import { TokenService } from './token.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: authentication (bearer for mobile, cookie + CSRF for web), session/user validity,
 * forced password change, and endpoint permissions. Permissions are loaded from the database on every
 * request so role changes apply immediately (AT-PLT-06).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const { token, via } = this.extractToken(req);
    if (!token) throw new Problem('UNAUTHENTICATED');
    const verified = this.tokens.verifyAccess(token);
    if (!verified.ok) throw new Problem(verified.expired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED');

    const session = await this.prisma.session.findUnique({
      where: { id: verified.claims.sid },
      select: {
        id: true,
        userId: true,
        platform: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            displayNameTh: true,
            locale: true,
            isActive: true,
            deletedAt: true,
            mustChangePassword: true,
            roles: {
              select: {
                role: { select: { code: true, permissions: { select: { permission: true } } } },
              },
            },
          },
        },
      },
    });
    const now = this.clock.now();
    if (
      !session ||
      session.userId !== verified.claims.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !session.user.isActive ||
      session.user.deletedAt
    ) {
      throw new Problem('UNAUTHENTICATED');
    }

    const permissions = new Set<Permission>();
    for (const ur of session.user.roles) {
      for (const p of ur.role.permissions)
        if (isPermission(p.permission)) permissions.add(p.permission);
    }
    const user: AuthUser = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayNameTh,
      locale: session.user.locale,
      sessionId: session.id,
      platform: session.platform,
      permissions,
      roleCodes: session.user.roles.map((r) => r.role.code),
      mustChangePassword: session.user.mustChangePassword,
      via,
    };
    req.user = user;
    RequestContext.set({ userId: user.id });

    if (
      via === 'cookie' &&
      !SAFE_METHODS.has(req.method) &&
      !this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, targets)
    ) {
      const header = req.headers[CSRF_HEADER];
      const cookie = (req.cookies as Record<string, string> | undefined)?.[COOKIE_CSRF];
      if (typeof header !== 'string' || !cookie || !safeEqual(header, cookie))
        throw new Problem('CSRF_INVALID');
    }

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, targets)
    ) {
      throw new Problem('PASSWORD_CHANGE_REQUIRED');
    }

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS,
      targets,
    );
    if (required?.length && !required.some((p) => permissions.has(p)))
      throw new Problem('FORBIDDEN');
    return true;
  }

  private extractToken(req: Request): { token?: string; via: 'cookie' | 'bearer' } {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return { token: auth.slice(7).trim(), via: 'bearer' };
    const cookie = (req.cookies as Record<string, string> | undefined)?.[COOKIE_ACCESS];
    return { token: cookie, via: 'cookie' };
  }
}
