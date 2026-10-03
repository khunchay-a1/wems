import { Injectable } from '@nestjs/common';
import type { SignatureMethod } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../../common/auth/auth-user';
import { verifySecret } from '../../../common/auth/password';
import { canonicalJson, sha256Hex } from '../../../common/crypto/crypto';
import { Problem } from '../../../common/errors/problem';
import { RequestContext } from '../../../common/http/request-context';
import { IdGenerator } from '../../../common/ids/id-generator';
import type { Tx } from '../../../common/prisma/helpers';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ClockService } from '../../../common/time/clock';
import { AuthService } from './auth.service';

export interface SignatureInput {
  method: 'PASSWORD' | 'SIGNING_PIN';
  secret: string;
}

export interface SignaturePayload {
  purpose: string;
  entityType: string;
  entityId: string;
  decision?: string | null;
  note?: string | null;
  fileSha256?: string | null;
  licenseId?: string | null;
}

/**
 * Electronic signatures (docs/06-security.md §4, BR-DOC-043): re-authentication with the password
 * or signing PIN, then a SignatureEvent bound to the file hash and a canonical payload hash.
 */
@Injectable()
export class SignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /**
   * Checks the secret outside any business transaction (a failure must still count towards the
   * lockout even though the action is rolled back).
   */
  async verify(user: AuthUser, sig: SignatureInput | undefined | null): Promise<SignatureMethod> {
    if (!sig?.secret) throw new Problem('DOC_SIGNATURE_REQUIRED', { rule: 'BR-DOC-043' });
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, signingPinHash: true },
    });
    const hash = sig.method === 'SIGNING_PIN' ? u.signingPinHash : u.passwordHash;
    if (!hash || !(await verifySecret(hash, sig.secret))) {
      await this.auth.registerFailedSecret(user.id, 'signature.failed');
      throw new Problem('DOC_SIGNATURE_INVALID', { rule: 'BR-DOC-043' });
    }
    return sig.method;
  }

  /** Stores the SignatureEvent inside the caller's transaction and returns its id. */
  async record(
    tx: Tx,
    userId: string,
    method: SignatureMethod,
    p: SignaturePayload,
  ): Promise<string> {
    const id = this.ids.next();
    const signedAt = this.clock.now();
    const ctx = RequestContext.get();
    const payloadSha256 = sha256Hex(
      canonicalJson({
        purpose: p.purpose,
        entityId: p.entityId,
        decision: p.decision ?? null,
        note: p.note ?? null,
        fileSha256: p.fileSha256 ?? null,
        signedAt: signedAt.toISOString(),
      }),
    );
    await tx.signatureEvent.create({
      data: {
        id,
        userId,
        purpose: p.purpose,
        entityType: p.entityType,
        entityId: p.entityId,
        method,
        fileSha256: p.fileSha256 ?? null,
        payloadSha256,
        licenseId: p.licenseId ?? null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        signedAt,
      },
    });
    return id;
  }
}
