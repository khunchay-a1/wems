import { Injectable } from '@nestjs/common';
import type { ClientPlatform } from '../../generated/prisma/client';
import { AppConfig } from '../config/app-config';
import { signJwt, type JwtVerifyResult, verifyJwt } from '../crypto/jwt';
import { ClockService } from '../time/clock';

export interface AccessClaims {
  sub: string;
  sid: string;
  typ: 'access';
}

export interface MfaClaims {
  sub: string;
  typ: 'mfa';
  plat: ClientPlatform;
  dev?: string;
  devName?: string;
}

const MFA_TOKEN_TTL_SEC = 5 * 60;

/** Access tokens (15 min, docs/06-security.md §2.2) and short-lived MFA challenge tokens. */
@Injectable()
export class TokenService {
  constructor(
    private readonly config: AppConfig,
    private readonly clock: ClockService,
  ) {}

  private nowSec(): number {
    return Math.floor(this.clock.now().getTime() / 1000);
  }

  get accessTtlSec(): number {
    return this.config.env.JWT_ACCESS_TTL;
  }

  issueAccess(userId: string, sessionId: string): string {
    const iat = this.nowSec();
    return signJwt(
      { sub: userId, sid: sessionId, typ: 'access', iat, exp: iat + this.accessTtlSec },
      this.config.env.JWT_ACCESS_SECRET,
    );
  }

  verifyAccess(
    token: string,
  ): { ok: true; claims: AccessClaims } | { ok: false; expired: boolean } {
    const res: JwtVerifyResult = verifyJwt(token, this.config.env.JWT_ACCESS_SECRET, this.nowSec());
    if (!res.ok) return { ok: false, expired: res.reason === 'expired' };
    if (res.claims.typ !== 'access' || typeof res.claims.sid !== 'string')
      return { ok: false, expired: false };
    return { ok: true, claims: { sub: res.claims.sub, sid: res.claims.sid, typ: 'access' } };
  }

  issueMfa(claims: Omit<MfaClaims, 'typ'>): string {
    const iat = this.nowSec();
    return signJwt(
      { ...claims, typ: 'mfa', iat, exp: iat + MFA_TOKEN_TTL_SEC },
      this.config.env.JWT_ACCESS_SECRET,
    );
  }

  verifyMfa(token: string): MfaClaims | null {
    const res = verifyJwt(token, this.config.env.JWT_ACCESS_SECRET, this.nowSec());
    if (!res.ok || res.claims.typ !== 'mfa') return null;
    return res.claims as unknown as MfaClaims;
  }
}
