import { Injectable, Logger } from '@nestjs/common';
import { zipSync } from 'fflate';
import QRCode from 'qrcode';
import type { DocumentFile, FileObject, Prisma } from '../../generated/prisma/client';
import { AppConfig } from '../../common/config/app-config';
import { sha256Hex } from '../../common/crypto/crypto';
import { enumLabel } from '../../common/i18n/enum-labels';
import { FilesService } from '../../common/files/files.service';
import { StorageService } from '../../common/files/storage.service';
import type { MailAttachment, MailJob } from '../../common/notifications/mailer.service';
import { MailerService } from '../../common/notifications/mailer.service';
import { PdfService } from '../../common/pdf/pdf.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.module';
import { QUEUES, type OutboxJobData } from '../../common/queue/queues';
import { SettingsService } from '../../common/settings/settings.service';
import { bangkokDate, buddhistYear } from '../../common/time/business-calendar';
import { publicToken, rolesFor } from '../../modules/documents/domain/transmittal';
import { RevisionStampService } from '../../modules/documents/revision-stamp.service';
import { HandlesEvents, type OutboxEventHandler } from '../handlers';

const include = {
  project: { select: { code: true, name: true } },
  sentBy: { select: { displayNameTh: true, position: true, email: true } },
  items: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      revision: {
        include: {
          document: { select: { number: true, title: true } },
          files: { where: { isCurrent: true }, include: { file: true } },
        },
      },
    },
  },
} satisfies Prisma.TransmittalInclude;
type Row = Prisma.TransmittalGetPayload<{ include: typeof include }>;

const thaiDate = (d: Date) => {
  const [y, m, day] = bangkokDate(d).split('-');
  return `${day}/${m}/${buddhistYear(Number(y))}`;
};

/**
 * pdf queue: after `transmittal.sent` (and on resend) build the cover sheet PDF, the ZIP package
 * for links, and queue the email (M04 §7, BR-DOC-062). Idempotent: generated files are reused
 * and the mail job id is the outbox event id.
 */
@Injectable()
@HandlesEvents('transmittal.sent', 'transmittal.resend_requested')
export class TransmittalHandler implements OutboxEventHandler {
  private readonly logger = new Logger(TransmittalHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly files: FilesService,
    private readonly storage: StorageService,
    private readonly stamps: RevisionStampService,
    private readonly settings: SettingsService,
    private readonly mailer: MailerService,
    private readonly queues: QueueService,
    private readonly config: AppConfig,
  ) {}

  async handle(event: OutboxJobData): Promise<void> {
    const id = String(event.payload.transmittalId);
    const t = await this.prisma.transmittal.findUnique({ where: { id }, include });
    if (!t || !t.sentAt || !t.sentById || (t.status !== 'SENT' && t.status !== 'ACKNOWLEDGED')) {
      this.logger.warn(`transmittal ${id} not sent — skipped`);
      return;
    }
    const link = t.publicTokenHash ? this.publicUrl(t.id, t.sentAt) : null;
    const cover = await this.coverSheet(t, link);
    if (t.deliveryMethod === 'EMAIL_LINK' && !t.packageFileId) await this.buildPackage(t, cover);
    if (t.deliveryMethod === 'EMAIL_ATTACHMENT' || t.deliveryMethod === 'EMAIL_LINK') {
      await this.queueEmail(event.eventId, t, cover, link);
    }
  }

  private publicUrl(id: string, sentAt: Date): string {
    const key = this.config.env.APP_ENCRYPTION_KEY ?? '';
    return `${this.config.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/t/${publicToken(key, id, sentAt.toISOString())}`;
  }

  private async coverSheet(t: Row, link: string | null): Promise<FileObject> {
    if (t.coverSheetFileId) {
      return this.prisma.fileObject.findUniqueOrThrow({ where: { id: t.coverSheetFileId } });
    }
    const company = await this.settings.get('company.profile');
    let logo: string | null = null;
    if (company.logoFileId) {
      const f = await this.prisma.fileObject.findUnique({ where: { id: company.logoFileId } });
      if (f?.status === 'AVAILABLE') {
        logo = `data:${f.mimeType};base64,${(await this.storage.getBuffer(f.storageKey)).toString('base64')}`;
      }
    }
    const body = await this.pdf.render(
      'transmittal',
      {
        company,
        logo,
        number: t.number,
        date: thaiDate(t.sentAt!),
        project: `${t.project.code} ${t.project.name}`,
        recipient: t.recipientName,
        emails: [...t.recipientEmails, ...t.ccEmails].join(', '),
        subject: t.subject,
        purpose: `${t.purposeCode} · ${enumLabel('PurposeCode', t.purposeCode, 'th')}`,
        message: t.message,
        items: t.items.map((i, n) => ({
          no: n + 1,
          number: i.revision.document.number,
          title: i.revision.document.title,
          rev: i.revision.revLabel,
          purpose: i.revision.purposeCode,
          format: enumLabel('TransmittalFormat', i.format, 'th'),
          copies: i.copies,
          remark: i.remark ?? '',
        })),
        link,
        qr: link ? await QRCode.toDataURL(link, { margin: 1, width: 200 }) : null,
        linkExpires: t.linkExpiresAt ? thaiDate(t.linkExpiresAt) : '',
        sender: { name: t.sentBy?.displayNameTh ?? '', position: t.sentBy?.position ?? '' },
      },
      { locale: 'th', footerLeft: t.number },
    );
    const file = await this.files.storeGenerated(null, {
      name: `${t.number}.pdf`,
      mimeType: 'application/pdf',
      body,
      uploadedById: t.sentById!,
      sha256: sha256Hex(body),
    });
    await this.prisma.transmittal.update({
      where: { id: t.id },
      data: { coverSheetFileId: file.id },
    });
    return file;
  }

  /** Stamped PDFs / native files of every item, as they go to the client. */
  private async outgoing(t: Row): Promise<{ name: string; body: Buffer; mimeType: string }[]> {
    const out: { name: string; body: Buffer; mimeType: string }[] = [];
    for (const i of t.items) {
      const roles = rolesFor(i.format) as string[];
      const files = i.revision.files.filter(
        (f): f is DocumentFile & { file: FileObject } =>
          roles.includes(f.role) && f.file.status === 'AVAILABLE',
      );
      for (const f of files) {
        const base = `${i.revision.document.number}_Rev${i.revision.revLabel}`;
        if (f.role === 'PDF_RENDITION') {
          const key = (await this.stamps.stampedKey(i.revision, f.file)) ?? f.file.storageKey;
          out.push({
            name: `${base}.pdf`,
            body: await this.storage.getBuffer(key),
            mimeType: 'application/pdf',
          });
        } else {
          const ext = /\.[^.]+$/.exec(f.file.originalName)?.[0] ?? '';
          out.push({
            name: `${base}${ext}`,
            body: await this.storage.getBuffer(f.file.storageKey),
            mimeType: f.file.mimeType,
          });
        }
      }
    }
    return out;
  }

  private async buildPackage(t: Row, cover: FileObject): Promise<void> {
    const entries: Record<string, Uint8Array> = {
      [cover.originalName]: await this.storage.getBuffer(cover.storageKey),
    };
    for (const f of await this.outgoing(t)) entries[f.name] = f.body;
    const body = Buffer.from(zipSync(entries, { level: 0 }));
    const file = await this.files.storeGenerated(null, {
      name: `${t.number}.zip`,
      mimeType: 'application/zip',
      body,
      uploadedById: t.sentById!,
      sha256: sha256Hex(body),
    });
    await this.prisma.transmittal.update({ where: { id: t.id }, data: { packageFileId: file.id } });
  }

  private async queueEmail(
    eventId: string,
    t: Row,
    cover: FileObject,
    link: string | null,
  ): Promise<void> {
    const company = await this.settings.get('company.profile');
    const attachments: MailAttachment[] = [
      {
        filename: cover.originalName,
        contentType: 'application/pdf',
        contentBase64: (await this.storage.getBuffer(cover.storageKey)).toString('base64'),
      },
    ];
    if (t.deliveryMethod === 'EMAIL_ATTACHMENT') {
      for (const f of await this.outgoing(t)) {
        attachments.push({
          filename: f.name,
          contentType: f.mimeType,
          contentBase64: f.body.toString('base64'),
        });
      }
    }
    const lines = [
      `เรียน ${t.recipientName}`,
      `${company.nameTh || 'บริษัท'} ขอนำส่งเอกสารโครงการ ${t.project.code} ${t.project.name} จำนวน ${t.items.length} รายการ ตามใบนำส่งเลขที่ ${t.number} (แนบ)`,
      ...(t.message ? [t.message] : []),
      ...t.items.map(
        (i, n) =>
          `${n + 1}. ${i.revision.document.number} Rev.${i.revision.revLabel} — ${i.revision.document.title}`,
      ),
      ...(link && t.linkExpiresAt
        ? [`ลิงก์ดาวน์โหลดหมดอายุวันที่ ${thaiDate(t.linkExpiresAt)}`]
        : []),
    ];
    const { html, text } = this.mailer.render({
      locale: 'th',
      title: `[${t.number}] ${t.subject}`,
      lines,
      actionUrl: link ?? undefined,
      actionLabel: link ? 'ดาวน์โหลดเอกสาร / Download' : undefined,
      companyName: company.nameTh || 'WEMS',
    });
    const job: MailJob = {
      to: t.recipientEmails,
      cc: t.ccEmails.length ? t.ccEmails : undefined,
      replyTo: t.sentBy?.email,
      subject: `[${t.number}] ${t.subject}`,
      html,
      text,
      attachments,
    };
    await this.queues.add(QUEUES.mail, 'transmittal', job, { jobId: `mail-${eventId}` });
  }
}
