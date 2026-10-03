import { Injectable } from '@nestjs/common';
import type { DocumentRevision, FileObject } from '../../generated/prisma/client';
import { sha256Hex } from '../../common/crypto/crypto';
import { StorageService } from '../../common/files/storage.service';
import { type StampSpec, StampService } from '../../common/pdf/stamp.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { bangkokDate } from '../../common/time/business-calendar';

/**
 * Status stamps on PDF renditions (BR-DOC-070). The original file never changes; the stamped copy
 * is cached in storage under `stamps/<fileId>/<stampHash>.pdf`. Shared by downloads (API) and
 * transmittal packages (worker).
 */
@Injectable()
export class RevisionStampService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly stamps: StampService,
  ) {}

  stampFor(
    r: { status: string; purposeCode: string; revLabel: string; approvedAt: Date | null },
    approverName: string | null,
    signatureRef: string | null,
  ): StampSpec | null {
    switch (r.status) {
      case 'DRAFT':
      case 'IN_REVIEW':
        return { kind: 'watermark', text: 'DRAFT – NOT FOR CONSTRUCTION', color: 'grey' };
      case 'SUPERSEDED':
        return { kind: 'watermark', text: 'SUPERSEDED – ฉบับเก่า ห้ามใช้', color: 'red' };
      case 'VOID':
        return { kind: 'watermark', text: 'VOID', color: 'grey' };
      case 'APPROVED':
      case 'ISSUED': {
        if (r.purposeCode === 'FC' || r.purposeCode === 'AB') {
          const head = r.purposeCode === 'AB' ? 'AS-BUILT' : 'APPROVED FOR CONSTRUCTION';
          const date = r.approvedAt ? bangkokDate(r.approvedAt) : '';
          return {
            kind: 'box',
            color: 'green',
            lines: [
              `${head} · Rev.${r.revLabel}`,
              [date, approverName].filter(Boolean).join(' · '),
              ...(signatureRef ? [`Ref ${signatureRef}`] : []),
            ],
          };
        }
        return {
          kind: 'box',
          color: 'orange',
          lines: [`PRELIMINARY – NOT FOR CONSTRUCTION · Rev.${r.revLabel}`],
        };
      }
      default:
        return null;
    }
  }

  /** Storage key of the stamped copy of a PDF rendition, or null when the status has no stamp. */
  async stampedKey(rev: DocumentRevision, file: FileObject): Promise<string | null> {
    return (await this.stamped(rev, file))?.key ?? null;
  }

  /** Stamped copy with the sha256 of its bytes (offline pins verify it — docs/08-mobile.md §6). */
  async stamped(
    rev: DocumentRevision,
    file: FileObject,
  ): Promise<{ key: string; sha256: string } | null> {
    const approval = rev.approvedById
      ? await this.prisma.reviewStep.findFirst({
          where: {
            assigneeId: rev.approvedById,
            kind: 'APPROVE',
            signatureEventId: { not: null },
            cycle: { revisionId: rev.id, status: 'APPROVED' },
          },
          include: { assignee: { select: { displayNameEn: true, displayNameTh: true } } },
        })
      : null;
    const spec = this.stampFor(
      rev,
      approval ? (approval.assignee.displayNameEn ?? approval.assignee.displayNameTh) : null,
      approval?.signatureEventId?.slice(0, 8) ?? null,
    );
    if (!spec) return null;
    const stampHash = sha256Hex(JSON.stringify(spec)).slice(0, 16);
    const key = `stamps/${file.id}/${stampHash}.pdf`;
    const cached = await this.storage.head(key);
    if (cached?.metadata.sha256) return { key, sha256: cached.metadata.sha256 };
    const original = await this.storage.getBuffer(file.storageKey);
    const stamped = await this.stamps.stamp(original, spec);
    const sha256 = sha256Hex(stamped);
    await this.storage.put(key, stamped, 'application/pdf', stamped.length, { sha256 });
    return { key, sha256 };
  }
}
