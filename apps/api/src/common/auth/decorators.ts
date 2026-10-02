import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user';
import type { Permission } from './permissions';

export const REQUIRED_PERMISSIONS = 'wems:permissions';
export const ALLOW_PENDING_PASSWORD_CHANGE = 'wems:allowPendingPasswordChange';
export const SKIP_CSRF = 'wems:skipCsrf';

/** Endpoint-level permission check (any of the listed permissions) — docs/06-security.md §3.1. */
export const RequirePermission = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Allowed while User.mustChangePassword is true (me, change-password, logout). */
export const AllowPendingPasswordChange = (): MethodDecorator =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

/** Routes that authenticate by other means (login/refresh issue the CSRF cookie). */
export const SkipCsrf = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_CSRF, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used on a public route');
  return req.user;
});
