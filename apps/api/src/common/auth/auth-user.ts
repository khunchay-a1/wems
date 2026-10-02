import type { ClientPlatform } from '../../generated/prisma/client';
import type { Permission } from './permissions';

/** The authenticated principal attached to each request by AuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  sessionId: string;
  platform: ClientPlatform;
  permissions: ReadonlySet<Permission>;
  roleCodes: readonly string[];
  mustChangePassword: boolean;
  /** how the token arrived — CSRF applies to cookies only */
  via: 'cookie' | 'bearer';
}

export function can(user: AuthUser, permission: Permission): boolean {
  return user.permissions.has(permission);
}
