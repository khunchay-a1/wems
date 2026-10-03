import { Injectable } from '@nestjs/common';
import { Problem } from '../../common/errors/problem';
import { FilesService } from '../../common/files/files.service';
import { IdGenerator } from '../../common/ids/id-generator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../../common/settings/settings.service';
import { ClockService } from '../../common/time/clock';
import { rolesFor } from './domain/transmittal';
import type { PublicDownloadDto, PublicTransmittalDto } from './dto/transmittals.dto';
import { RevisionStampService } from './revision-stamp.service';
import { TransmittalsService } from './transmittals.service';

/**
 * Download page for clients without a login (`/t/<token>`, BR-DOC-065): only the items of that
 * transmittal; every download is recorded; expired or revoked links answer 410.
 */
@Injectable()
export class PublicTransmittalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transmittals: TransmittalsService,
    private readonly files: FilesService,
    private readonly stamps: RevisionStampService,
    private readonly settings: SettingsService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  async view(token: string): Promise<PublicTransmittalDto> {
    const t = await this.transmittals.findByToken(token);
    const company = await this.settings.get('company.profile');
    return {
      companyName: company.nameTh || company.nameEn || 'WEMS',
      number: t.number,
      subject: t.subject,
      projectName: t.project.name,
      sentAt: t.sentAt!.toISOString(),
      linkExpiresAt: t.linkExpiresAt!.toISOString(),
      senderName: t.sentBy?.displayNameTh ?? '',
      senderEmail: t.sentBy?.email ?? null,
      hasPackage: !!t.packageFileId,
      items: t.items.map((i) => ({
        id: i.id,
        documentNumber: i.revision.document.number,
        documentTitle: i.revision.document.title,
        revLabel: i.revision.revLabel,
        files: i.revision.files
          .filter((f) => (rolesFor(i.format) as string[]).includes(f.role))
          .map((f) => f.file.originalName),
      })),
    };
  }

  /** Signed URL of an item's file; PDFs carry their status stamp (BR-DOC-070). */
  async download(
    token: string,
    itemId: string,
    role: 'PDF_RENDITION' | 'NATIVE' | undefined,
    client: { ip?: string; userAgent?: string },
  ): Promise<PublicDownloadDto> {
    const t = await this.transmittals.findByToken(token);
    const item = t.items.find((i) => i.id === itemId);
    if (!item) throw new Problem('NOT_FOUND');
    const roles = rolesFor(item.format);
    const wanted = role ?? roles[0];
    if (!wanted || !(roles as string[]).includes(wanted)) throw new Problem('NOT_FOUND');
    const df = await this.prisma.documentFile.findFirst({
      where: { revisionId: item.revisionId, role: wanted, isCurrent: true },
      include: { file: true },
    });
    if (!df || df.file.status !== 'AVAILABLE') throw new Problem('NOT_FOUND');
    await this.record(t.id, df.file.id, client);
    const rev = await this.prisma.documentRevision.findUniqueOrThrow({
      where: { id: item.revisionId },
    });
    const name = `${item.revision.document.number}_Rev${item.revision.revLabel}`;
    if (wanted === 'PDF_RENDITION') {
      const key = await this.stamps.stampedKey(rev, df.file);
      if (key) {
        return this.files.signedDownload(
          { ...df.file, storageKey: key, mimeType: 'application/pdf' },
          `${name}.pdf`,
        );
      }
    }
    return this.files.signedDownload(df.file);
  }

  /** The ZIP of all files, built by the worker after sending. */
  async package(
    token: string,
    client: { ip?: string; userAgent?: string },
  ): Promise<PublicDownloadDto> {
    const t = await this.transmittals.findByToken(token);
    if (!t.packageFileId) throw new Problem('FILE_NOT_UPLOADED');
    const file = await this.prisma.fileObject.findUniqueOrThrow({ where: { id: t.packageFileId } });
    await this.record(t.id, file.id, client);
    return this.files.signedDownload(file);
  }

  private async record(
    transmittalId: string,
    fileId: string,
    client: { ip?: string; userAgent?: string },
  ): Promise<void> {
    await this.prisma.transmittalDownload.create({
      data: {
        id: this.ids.next(),
        transmittalId,
        fileId,
        ip: client.ip ?? null,
        userAgent: client.userAgent?.slice(0, 500) ?? null,
        downloadedAt: this.clock.now(),
      },
    });
  }
}
