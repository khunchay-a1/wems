import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from './auth-user';

/**
 * Rate limit key: the signed-in user, otherwise IP + email for auth routes
 * (docs/04-api-conventions.md §11: login/refresh 10/min per IP+email; general 300/min per user).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as AuthUser | undefined;
    if (user) return Promise.resolve(`u:${user.id}`);
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : '';
    return Promise.resolve(`ip:${String(req.ip)}:${email}`);
  }
}
