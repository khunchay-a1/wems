import { Injectable } from '@nestjs/common';
import type { ClientPlatform, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthUser } from '../../../common/auth/auth-user';
import {
  checkPasswordPolicy,
  dummyVerify,
  hashSecret,
  verifySecret,
} from '../../../common/auth/password';
import { TokenService } from '../../../common/auth/token.service';
import { AppConfig } from '../../../common/config/app-config';
import { decrypt, encrypt, randomToken, sha256Hex } from '../../../common/crypto/crypto';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../../common/crypto/totp';
import { Problem } from '../../../common/errors/problem';
import { RequestContext } from '../../../common/http/request-context';
import { IdGenerator } from '../../../common/ids/id-generator';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { bumpVersion, type Tx } from '../../../common/prisma/helpers';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SettingsService } from '../../../common/settings/settings.service';
import { ClockService } from '../../../common/time/clock';
import type { MeDto, MfaSetupResponseDto, SessionDto } from './dto/auth.dto';

/** Lockout policy (docs/06-security.md §2.1) */
export const MAX_FAILED_LOGINS = 10;
export const LOCK_MINUTES = 15;
/** Two tabs refreshing the same web cookie at once must not be treated as token theft */
export const WEB_ROTATION_GRACE_MS = 5_000;

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  platform: ClientPlatform;
  userId: string;
}

export type LoginOutcome =
  { kind: 'mfa'; mfaToken: string } | { kind: 'session'; session: IssuedSession };

interface DeviceInfo {
  platform: ClientPlatform;
  deviceId?: string;
  deviceName?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly settings: SettingsService,
  ) {}

  // ───────────────────────── login ─────────────────────────

  async login(emailRaw: string, password: string, device: DeviceInfo): Promise<LoginOutcome> {
    const email = emailRaw.trim().toLowerCase();
    const now = this.clock.now();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive || user.deletedAt || !user.passwordHash) {
      await dummyVerify(password);
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'auth.login_failed',
          entityType: 'User',
          entityId: user?.id ?? null,
          actorId: user?.id ?? null,
          summary: 'unknown or inactive account',
        }),
      );
      throw new Problem('INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'auth.login_blocked_locked',
          entityType: 'User',
          entityId: user.id,
          actorId: user.id,
        }),
      );
      throw new Problem('ACCOUNT_LOCKED', { rule: 'AT-PLT-01' });
    }

    if (!(await verifySecret(user.passwordHash, password))) {
      await this.registerFailedSecret(user.id, 'auth.login_failed');
      throw new Problem('INVALID_CREDENTIALS');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    if (user.mfaEnabled) {
      return {
        kind: 'mfa',
        mfaToken: this.tokens.issueMfa({
          sub: user.id,
          plat: device.platform,
          dev: device.deviceId,
          devName: device.deviceName,
        }),
      };
    }
    return { kind: 'session', session: await this.startSession(user.id, device, 'auth.login') };
  }

  async verifyMfa(mfaToken: string, code: string): Promise<IssuedSession> {
    const claims = this.tokens.verifyMfa(mfaToken);
    if (!claims) throw new Problem('UNAUTHENTICATED');
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || !user.isActive || user.deletedAt || !user.mfaEnabled || !user.mfaSecretEnc) {
      throw new Problem('UNAUTHENTICATED');
    }
    if (user.lockedUntil && user.lockedUntil > this.clock.now())
      throw new Problem('ACCOUNT_LOCKED');
    const secret = decrypt(user.mfaSecretEnc, this.encryptionKey());
    if (!verifyTotp(secret, code, this.clock.now().getTime())) {
      await this.registerFailedSecret(user.id, 'auth.mfa_failed');
      throw new Problem('MFA_INVALID_CODE');
    }
    return this.startSession(
      user.id,
      { platform: claims.plat, deviceId: claims.dev, deviceName: claims.devName },
      'auth.login',
    );
  }

  /**
   * Counts a wrong password/PIN/TOTP towards lockout (docs/06-security.md §2.1, §4).
   * The 10th consecutive failure locks the account for 15 minutes and emails the user.
   */
  async registerFailedSecret(userId: string, action: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      await this.audit.record(tx, {
        action,
        entityType: 'User',
        entityId: userId,
        actorId: userId,
      });
      if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
        const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
        await tx.user.update({ where: { id: userId }, data: { lockedUntil, failedLoginCount: 0 } });
        await this.audit.record(tx, {
          action: 'auth.account_locked',
          entityType: 'User',
          entityId: userId,
          actorId: userId,
          summary: `locked until ${lockedUntil.toISOString()}`,
        });
        await this.outbox.publish(
          tx,
          'auth.account_locked',
          { userId, lockedUntil: lockedUntil.toISOString(), actorId: null },
          userId,
        );
      }
    });
  }

  private refreshTtlMs(platform: ClientPlatform): number {
    const days =
      platform === 'WEB'
        ? this.config.env.REFRESH_TTL_WEB_DAYS
        : this.config.env.REFRESH_TTL_MOBILE_DAYS;
    return days * 24 * 60 * 60 * 1000;
  }

  private async startSession(
    userId: string,
    device: DeviceInfo,
    auditAction: string,
  ): Promise<IssuedSession> {
    const now = this.clock.now();
    const sessionId = this.ids.next();
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(now.getTime() + this.refreshTtlMs(device.platform));
    const ctx = RequestContext.get();
    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          id: sessionId,
          userId,
          familyId: this.ids.next(),
          refreshTokenHash: sha256Hex(refreshToken),
          platform: device.platform,
          deviceId: device.deviceId ?? null,
          deviceName: device.deviceName ?? null,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          createdAt: now,
          lastUsedAt: now,
          expiresAt: refreshExpiresAt,
        },
      });
      await tx.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
      await this.audit.record(tx, {
        action: auditAction,
        entityType: 'Session',
        entityId: sessionId,
        actorId: userId,
        summary: device.platform,
      });
    });
    return {
      sessionId,
      userId,
      platform: device.platform,
      accessToken: this.tokens.issueAccess(userId, sessionId),
      refreshToken,
      refreshExpiresAt,
    };
  }

  // ───────────────────────── refresh (rotation + reuse detection) ─────────────────────────

  async refresh(refreshToken: string): Promise<IssuedSession> {
    const now = this.clock.now();
    const hash = sha256Hex(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: { select: { isActive: true, deletedAt: true } } },
    });
    if (!session) throw new Problem('UNAUTHENTICATED');

    if (session.revokedAt) {
      const withinGrace =
        session.platform === 'WEB' &&
        session.revokedReason === 'rotated' &&
        now.getTime() - session.revokedAt.getTime() <= WEB_ROTATION_GRACE_MS;
      if (session.replacedBySessionId && !withinGrace)
        await this.revokeFamilyForReuse(session.familyId, session.userId);
      throw new Problem('UNAUTHENTICATED');
    }
    if (session.expiresAt <= now || !session.user.isActive || session.user.deletedAt) {
      throw new Problem('TOKEN_EXPIRED');
    }
    if (session.platform === 'WEB') {
      const idle = await this.settings.get('security.sessionIdleMinutes');
      if (now.getTime() - session.lastUsedAt.getTime() > idle * 60_000) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: now, revokedReason: 'idle' },
        });
        throw new Problem('TOKEN_EXPIRED');
      }
    }

    const newId = this.ids.next();
    const newToken = randomToken();
    const expiresAt = new Date(now.getTime() + this.refreshTtlMs(session.platform));
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Atomic claim: only one concurrent refresh can rotate a given token
      const claimed = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'rotated', replacedBySessionId: newId },
      });
      if (claimed.count === 0) return false;
      await tx.session.create({
        data: {
          id: newId,
          userId: session.userId,
          familyId: session.familyId,
          refreshTokenHash: sha256Hex(newToken),
          platform: session.platform,
          deviceId: session.deviceId,
          deviceName: session.deviceName,
          ip: RequestContext.get().ip ?? session.ip,
          userAgent: RequestContext.get().userAgent ?? session.userAgent,
          createdAt: now,
          lastUsedAt: now,
          expiresAt,
        },
      });
      return true;
    });
    if (!rotated) throw new Problem('UNAUTHENTICATED');
    return {
      sessionId: newId,
      userId: session.userId,
      platform: session.platform,
      accessToken: this.tokens.issueAccess(session.userId, newId),
      refreshToken: newToken,
      refreshExpiresAt: expiresAt,
    };
  }

  /** AT-PLT-02: reuse of a rotated refresh token revokes the whole family and alerts the user. */
  private async revokeFamilyForReuse(familyId: string, userId: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'token_reuse' },
      });
      await this.audit.record(tx, {
        action: 'auth.token_reuse_detected',
        entityType: 'User',
        entityId: userId,
        actorId: userId,
        summary: `family ${familyId} revoked`,
      });
      await this.outbox.publish(
        tx,
        'auth.token_reuse_detected',
        { userId, familyId, actorId: null },
        userId,
      );
    });
  }

  // ───────────────────────── logout / sessions ─────────────────────────

  async logout(sessionId: string | null, refreshToken: string | null): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const where: Prisma.SessionWhereInput = sessionId
        ? { id: sessionId }
        : refreshToken
          ? { refreshTokenHash: sha256Hex(refreshToken) }
          : { id: '00000000-0000-0000-0000-000000000000' };
      const session = await tx.session.findFirst({ where });
      if (!session) return;
      await tx.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'logout' },
      });
      await this.audit.record(tx, {
        action: 'auth.logout',
        entityType: 'Session',
        entityId: session.id,
        actorId: session.userId,
      });
    });
  }

  async listSessions(user: AuthUser): Promise<SessionDto[]> {
    const now = this.clock.now();
    const rows = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      platform: s.platform,
      deviceName: s.deviceName,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === user.sessionId,
    }));
  }

  async revokeSession(user: AuthUser, sessionId: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const s = await tx.session.findFirst({ where: { id: sessionId, userId: user.id } });
      if (!s) throw new Problem('NOT_FOUND');
      await tx.session.updateMany({
        where: { familyId: s.familyId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'user_revoked' },
      });
      await this.audit.record(tx, {
        action: 'auth.session_revoked',
        entityType: 'Session',
        entityId: s.id,
      });
    });
  }

  /** Revoke every session of a user (deactivation, admin force logout, password reset). */
  async revokeAllSessions(
    tx: Tx,
    userId: string,
    reason: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const res = await tx.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}),
      },
      data: { revokedAt: this.clock.now(), revokedReason: reason },
    });
    return res.count;
  }

  // ───────────────────────── me / profile security ─────────────────────────

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
        projectMemberships: {
          where: { removedAt: null, project: { deletedAt: null } },
          include: { project: { select: { id: true, code: true, name: true } } },
          orderBy: { addedAt: 'desc' },
        },
      },
    });
    const roleCodes = user.roles.map((r) => r.role.code);
    const permissions = [
      ...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission))),
    ].sort();
    const requireMfa = await this.settings.get('security.requireMfaRoles');
    return {
      id: user.id,
      version: user.version,
      email: user.email,
      displayNameTh: user.displayNameTh,
      displayNameEn: user.displayNameEn,
      position: user.position,
      phone: user.phone,
      departmentId: user.departmentId,
      locale: user.locale,
      calendar: user.calendar,
      mfaEnabled: user.mfaEnabled,
      mfaSetupRequired: !user.mfaEnabled && roleCodes.some((c) => requireMfa.includes(c)),
      mustChangePassword: user.mustChangePassword,
      hasSigningPin: !!user.signingPinHash,
      roles: roleCodes,
      permissions,
      projects: user.projectMemberships.map((m) => ({
        id: m.project.id,
        code: m.project.code,
        name: m.project.name,
        role: m.role,
      })),
    };
  }

  private async requirePassword(
    userId: string,
    password: string,
  ): Promise<{ email: string; displayNameTh: string; displayNameEn: string | null }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifySecret(user.passwordHash, password))) {
      await this.registerFailedSecret(userId, 'auth.reauth_failed');
      throw new Problem('PASSWORD_INCORRECT', {
        errors: [{ field: 'password', code: 'INCORRECT' }],
      });
    }
    return user;
  }

  async changePassword(
    user: AuthUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifySecret(existing.passwordHash, currentPassword))) {
      await this.registerFailedSecret(user.id, 'auth.reauth_failed');
      throw new Problem('PASSWORD_INCORRECT', {
        errors: [{ field: 'currentPassword', code: 'INCORRECT' }],
      });
    }
    const violation = checkPasswordPolicy(newPassword, {
      email: existing.email,
      names: [existing.displayNameTh, existing.displayNameEn],
    });
    if (violation)
      throw new Problem('PASSWORD_POLICY', { errors: [{ field: 'newPassword', code: violation }] });
    if (await verifySecret(existing.passwordHash, newPassword)) {
      throw new Problem('PASSWORD_POLICY', {
        errors: [{ field: 'newPassword', code: 'SAME_AS_CURRENT' }],
      });
    }
    const hash = await hashSecret(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hash,
          mustChangePassword: false,
          failedLoginCount: 0,
          ...bumpVersion,
        },
      });
      await this.revokeAllSessions(tx, user.id, 'password_changed', user.sessionId);
      await this.audit.record(tx, {
        action: 'auth.password_changed',
        entityType: 'User',
        entityId: user.id,
      });
    });
  }

  private encryptionKey(): string {
    const key = this.config.env.APP_ENCRYPTION_KEY;
    if (!key)
      throw new Problem('SERVICE_UNAVAILABLE', { detail: 'APP_ENCRYPTION_KEY is not configured' });
    return key;
  }

  async mfaSetup(user: AuthUser, password: string): Promise<MfaSetupResponseDto> {
    const u = await this.requirePassword(user.id, password);
    const existing = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mfaEnabled: true },
    });
    if (existing.mfaEnabled) throw new Problem('MFA_ALREADY_ENABLED');
    const secret = generateTotpSecret();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { mfaSecretEnc: encrypt(secret, this.encryptionKey()) },
      });
      await this.audit.record(tx, {
        action: 'auth.mfa_setup_started',
        entityType: 'User',
        entityId: user.id,
      });
    });
    return { secret, otpauthUrl: otpauthUrl(secret, u.email) };
  }

  async mfaEnable(user: AuthUser, code: string): Promise<void> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (u.mfaEnabled) throw new Problem('MFA_ALREADY_ENABLED');
    if (!u.mfaSecretEnc) throw new Problem('MFA_NOT_CONFIGURED');
    if (
      !verifyTotp(decrypt(u.mfaSecretEnc, this.encryptionKey()), code, this.clock.now().getTime())
    ) {
      throw new Problem('MFA_INVALID_CODE');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: true, ...bumpVersion } });
      await this.audit.record(tx, {
        action: 'auth.mfa_enabled',
        entityType: 'User',
        entityId: user.id,
      });
    });
  }

  async mfaDisable(user: AuthUser, password: string, code: string): Promise<void> {
    await this.requirePassword(user.id, password);
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!u.mfaEnabled || !u.mfaSecretEnc) throw new Problem('MFA_NOT_CONFIGURED');
    const requireMfa = await this.settings.get('security.requireMfaRoles');
    if (user.roleCodes.some((c) => requireMfa.includes(c)))
      throw new Problem('MFA_REQUIRED_FOR_ROLE');
    if (
      !verifyTotp(decrypt(u.mfaSecretEnc, this.encryptionKey()), code, this.clock.now().getTime())
    ) {
      throw new Problem('MFA_INVALID_CODE');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { mfaEnabled: false, mfaSecretEnc: null, ...bumpVersion },
      });
      await this.audit.record(tx, {
        action: 'auth.mfa_disabled',
        entityType: 'User',
        entityId: user.id,
      });
    });
  }

  async setSigningPin(user: AuthUser, password: string, pin: string): Promise<void> {
    await this.requirePassword(user.id, password);
    if (
      !/^\d{6}$/.test(pin) ||
      /^(\d)\1{5}$/.test(pin) ||
      '0123456789'.includes(pin) ||
      '9876543210'.includes(pin)
    ) {
      throw new Problem('SIGNING_PIN_INVALID_FORMAT', {
        errors: [{ field: 'pin', code: 'WEAK_OR_INVALID' }],
      });
    }
    const hash = await hashSecret(pin);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { signingPinHash: hash, ...bumpVersion },
      });
      await this.audit.record(tx, {
        action: 'auth.signing_pin_set',
        entityType: 'User',
        entityId: user.id,
      });
    });
  }
}
