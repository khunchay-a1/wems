import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ChangeLogService, Scope } from '../../common/audit/change-log.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { ProjectAccessService, type ProjectAccess } from '../../common/auth/project-access.service';
import { AppConfig } from '../../common/config/app-config';
import { sha256Hex } from '../../common/crypto/crypto';
import { Problem } from '../../common/errors/problem';
import { FileAccessRegistry } from '../../common/files/file-access.registry';
import { FilesService } from '../../common/files/files.service';
import { pageArgs, parseSort, type Page } from '../../common/http/pagination';
import { IdGenerator } from '../../common/ids/id-generator';
import { NumberingService } from '../../common/numbering/numbering.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  assertVersionedUpdate,
  bumpVersion,
  fromDateOnly,
  iso,
  notDeleted,
  toDateOnly,
  type Tx,
} from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../../common/settings/settings.service';
import { bangkokDate } from '../../common/time/business-calendar';
import { ClockService } from '../../common/time/clock';
import { transmittalsAllowed } from '../projects/domain/project-state-machine';
import {
  assertEditable,
  assertTransmittalTransition,
  canTransmittal,
  effectiveDelivery,
  isEmail,
  itemProblem,
  linkUsable,
  publicToken,
  rolesFor,
} from './domain/transmittal';
import type {
  AcknowledgeDto,
  CancelTransmittalDto,
  ClientResponseDto,
  CreateTransmittalDto,
  ExtendLinkDto,
  ListTransmittalsQueryDto,
  SendResultDto,
  TransmittableRevisionDto,
  TransmittalDto,
  TransmittalItemDto,
  TransmittalItemInputDto,
  TransmittalListItemDto,
  TransmittalVersionDto,
  UpdateTransmittalDto,
  UpdateTransmittalItemDto,
} from './dto/transmittals.dto';

const itemInclude = {
  revision: {
    include: {
      document: {
        select: {
          id: true,
          projectId: true,
          number: true,
          title: true,
          confidentiality: true,
          latestApprovedRevisionId: true,
        },
      },
      files: {
        where: { isCurrent: true },
        include: { file: { select: { sizeBytes: true, originalName: true } } },
      },
    },
  },
} satisfies Prisma.TransmittalItemInclude;

const transmittalInclude = {
  items: { include: itemInclude, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  sentBy: { select: { id: true, displayNameTh: true } },
  downloads: { orderBy: { downloadedAt: 'desc' }, take: 100 },
} satisfies Prisma.TransmittalInclude;
type TransmittalRow = Prisma.TransmittalGetPayload<{ include: typeof transmittalInclude }>;
type ItemRow = TransmittalRow['items'][number];

const itemBytes = (i: Pick<ItemRow, 'format' | 'revision'>): number =>
  i.revision.files
    .filter((f) => (rolesFor(i.format) as string[]).includes(f.role))
    .reduce((n, f) => n + Number(f.file.sizeBytes), 0);

/** Transmittals to the client (M04 §3.5, §7; docs/05-workflows.md §4; BR-DOC-060..066). */
@Injectable()
export class TransmittalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly changes: ChangeLogService,
    private readonly outbox: OutboxService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
    private readonly projects: ProjectAccessService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
    private readonly config: AppConfig,
    registry: FileAccessRegistry,
  ) {
    // cover sheets, packages, receipts and client comment files follow the transmittal's project
    registry.registerReader(async (user, fileId) => {
      const t = await this.prisma.transmittal.findFirst({
        where: {
          OR: [
            { coverSheetFileId: fileId },
            { packageFileId: fileId },
            { acknowledgementFileId: fileId },
            { items: { some: { clientCommentFileId: fileId } } },
          ],
        },
        select: { projectId: true },
      });
      if (!t) return false;
      return (
        !!(await this.projects.resolve(user, t.projectId)) && user.permissions.has('document.read')
      );
    });
  }

  // ───────────────────────── access ─────────────────────────

  private async projectAccess(user: AuthUser, projectId: string, tx?: Tx): Promise<ProjectAccess> {
    const access = await this.projects.resolve(user, projectId, tx);
    if (!access || !user.permissions.has('document.read')) throw new Problem('NOT_FOUND');
    return access;
  }

  private async load(user: AuthUser, id: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const t = await db.transmittal.findUnique({ where: { id }, include: transmittalInclude });
    if (!t) throw new Problem('NOT_FOUND');
    const access = await this.projectAccess(user, t.projectId, tx);
    return { t, access };
  }

  private requireManage(user: AuthUser, access: ProjectAccess): void {
    if (!user.permissions.has('transmittal.manage')) throw new Problem('FORBIDDEN');
    if (access.readOnly || !transmittalsAllowed(access.project.status)) {
      throw new Problem('PROJECT_READ_ONLY', { rule: 'BR-PRJ-020' });
    }
  }

  // ───────────────────────── read ─────────────────────────

  async list(
    user: AuthUser,
    projectId: string,
    q: ListTransmittalsQueryDto,
  ): Promise<Page<TransmittalListItemDto>> {
    await this.projectAccess(user, projectId);
    const { skip, take, page, pageSize } = pageArgs(q);
    const sort = parseSort(q.sort, ['number', 'sentAt', 'createdAt'] as const, [
      { field: 'createdAt', dir: 'desc' },
    ]);
    const where: Prisma.TransmittalWhereInput = {
      projectId,
      status: q.status,
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: 'insensitive' } },
              { subject: { contains: q.q, mode: 'insensitive' } },
              { recipientName: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.transmittal.findMany({
        where,
        include: { items: { select: { clientReturnCode: true } } },
        orderBy: sort.map((s) => ({ [s.field]: s.dir })),
        skip,
        take,
      }),
      this.prisma.transmittal.count({ where }),
    ]);
    return {
      data: rows.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        number: t.number,
        subject: t.subject,
        recipientName: t.recipientName,
        purposeCode: t.purposeCode,
        status: t.status,
        deliveryMethod: t.deliveryMethod,
        sentAt: iso(t.sentAt),
        itemCount: t.items.length,
        respondedCount: t.items.filter((i) => i.clientReturnCode).length,
        createdAt: t.createdAt.toISOString(),
        version: t.version,
      })),
      meta: { page, pageSize, total },
    };
  }

  async get(user: AuthUser, id: string): Promise<TransmittalDto> {
    const { t, access } = await this.load(user, id);
    return this.toDto(user, access, t);
  }

  private async toDto(
    user: AuthUser,
    access: ProjectAccess,
    t: TransmittalRow,
  ): Promise<TransmittalDto> {
    const maxMb = await this.settings.get('transmittal.maxAttachmentMb');
    const totalBytes = t.items.reduce((n, i) => n + itemBytes(i), 0);
    const fileNames = new Map(
      (t.downloads.some((d) => d.fileId)
        ? await this.prisma.fileObject.findMany({
            where: { id: { in: t.downloads.map((d) => d.fileId).filter((x): x is string => !!x) } },
            select: { id: true, originalName: true },
          })
        : []
      ).map((f) => [f.id, f.originalName]),
    );
    const { allowed, blocked } = this.actions(user, access, t);
    return {
      id: t.id,
      projectId: t.projectId,
      number: t.number,
      subject: t.subject,
      recipientName: t.recipientName,
      recipientClientId: t.recipientClientId,
      recipientEmails: t.recipientEmails,
      ccEmails: t.ccEmails,
      purposeCode: t.purposeCode,
      status: t.status,
      deliveryMethod: t.deliveryMethod,
      message: t.message,
      sentAt: iso(t.sentAt),
      sentBy: t.sentBy ? { id: t.sentBy.id, displayName: t.sentBy.displayNameTh } : null,
      acknowledgedAt: toDateOnly(t.acknowledgedAt),
      acknowledgedNote: t.acknowledgedNote,
      cancelReason: t.cancelReason,
      coverSheetFileId: t.coverSheetFileId,
      publicUrl: t.publicTokenHash && t.sentAt ? this.publicUrl(t.id, t.sentAt) : null,
      linkExpiresAt: iso(t.linkExpiresAt),
      linkRevokedAt: iso(t.linkRevokedAt),
      totalBytes,
      willSendLink: effectiveDelivery(t.deliveryMethod, totalBytes, maxMb) !== t.deliveryMethod,
      maxAttachmentMb: maxMb,
      itemCount: t.items.length,
      respondedCount: t.items.filter((i) => i.clientReturnCode).length,
      items: t.items.map((i) => this.itemDto(i)),
      downloads: t.downloads.map((d) => ({
        downloadedAt: d.downloadedAt.toISOString(),
        fileName: d.fileId ? (fileNames.get(d.fileId) ?? null) : null,
        ip: d.ip,
      })),
      createdAt: t.createdAt.toISOString(),
      version: t.version,
      allowedActions: allowed,
      blockedActions: blocked,
    };
  }

  private itemDto(i: ItemRow): TransmittalItemDto {
    const d = i.revision.document;
    return {
      id: i.id,
      revisionId: i.revisionId,
      documentId: d.id,
      documentNumber: d.number,
      documentTitle: d.title,
      revLabel: i.revision.revLabel,
      purposeCode: i.revision.purposeCode,
      revisionStatus: i.revision.status,
      isLatest: d.latestApprovedRevisionId === i.revisionId,
      copies: i.copies,
      format: i.format,
      remark: i.remark,
      sizeBytes: itemBytes(i),
      clientReturnCode: i.clientReturnCode,
      clientReturnedAt: toDateOnly(i.clientReturnedAt),
      clientResponseNote: i.clientResponseNote,
      clientCommentFileId: i.clientCommentFileId,
      sortOrder: i.sortOrder,
    };
  }

  private actions(user: AuthUser, access: ProjectAccess, t: TransmittalRow) {
    const allowed: string[] = ['coverSheet'];
    const blocked: { action: string; code: string }[] = [];
    if (!user.permissions.has('transmittal.manage')) return { allowed, blocked };
    if (access.readOnly || !transmittalsAllowed(access.project.status)) {
      blocked.push({ action: 'send', code: 'PROJECT_READ_ONLY' });
      return { allowed, blocked };
    }
    if (t.status === 'DRAFT') {
      allowed.push('edit', 'addItem', 'cancel');
      if (!t.items.length) blocked.push({ action: 'send', code: 'TRN_NO_ITEMS' });
      else if (isEmail(t.deliveryMethod) && !t.recipientEmails.length)
        blocked.push({ action: 'send', code: 'TRN_NO_RECIPIENT' });
      else if (t.items.some((i) => itemProblem(this.revFacts(i), t.projectId)))
        blocked.push({ action: 'send', code: 'TRN_ITEM_NOT_APPROVED' });
      else allowed.push('send');
    }
    if (canTransmittal(t.status, 'acknowledge')) allowed.push('acknowledge');
    if (t.status === 'SENT' || t.status === 'ACKNOWLEDGED') {
      allowed.push('recordResponse');
      if (isEmail(t.deliveryMethod)) allowed.push('resendEmail');
      if (t.publicTokenHash) {
        allowed.push('extendLink');
        if (!t.linkRevokedAt) allowed.push('revokeLink');
      }
    }
    return { allowed, blocked };
  }

  private revFacts(i: Pick<ItemRow, 'revision'>) {
    return {
      status: i.revision.status,
      projectId: i.revision.document.projectId,
      confidentiality: i.revision.document.confidentiality,
    };
  }

  /** HMAC key of public links (the server's APP_ENCRYPTION_KEY). */
  private linkKey(): string {
    const key = this.config.env.APP_ENCRYPTION_KEY;
    if (!key) throw new Problem('SERVICE_UNAVAILABLE');
    return key;
  }

  publicUrl(id: string, sentAt: Date): string {
    const token = publicToken(this.linkKey(), id, sentAt.toISOString());
    return `${this.config.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/t/${token}`;
  }

  /** Approved/issued, shareable revisions of the project for the item picker (BR-DOC-060/061). */
  async transmittable(
    user: AuthUser,
    projectId: string,
    q: string | undefined,
  ): Promise<TransmittableRevisionDto[]> {
    await this.projectAccess(user, projectId);
    const rows = await this.prisma.documentRevision.findMany({
      where: {
        status: { in: ['APPROVED', 'ISSUED'] },
        document: {
          projectId,
          confidentiality: 'CLIENT_SHAREABLE',
          ...notDeleted,
          ...(q
            ? {
                OR: [
                  { number: { contains: q, mode: 'insensitive' } },
                  { title: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      },
      include: itemInclude.revision.include,
      orderBy: [{ document: { number: 'asc' } }, { revIndex: 'desc' }],
      take: 200,
    });
    return rows.map((r) => ({
      revisionId: r.id,
      documentId: r.document.id,
      documentNumber: r.document.number,
      documentTitle: r.document.title,
      revLabel: r.revLabel,
      purposeCode: r.purposeCode,
      status: r.status,
      isLatest: r.document.latestApprovedRevisionId === r.id,
      sizeBytes: r.files
        .filter((f) => f.role === 'PDF_RENDITION')
        .reduce((n, f) => n + Number(f.file.sizeBytes), 0),
    }));
  }

  // ───────────────────────── draft ─────────────────────────

  async create(
    user: AuthUser,
    projectId: string,
    dto: CreateTransmittalDto,
  ): Promise<TransmittalDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const access = await this.projectAccess(user, projectId, tx);
      this.requireManage(user, access);
      await this.assertRecipientClient(tx, dto.recipientClientId);
      const id = this.ids.next();
      const number = await this.numbering.next(
        tx,
        'TRANSMITTAL',
        { project: access.project.code },
        {
          projectId,
          exists: async (n) =>
            !!(await tx.transmittal.findUnique({ where: { number: n }, select: { id: true } })),
        },
      );
      await tx.transmittal.create({
        data: {
          id,
          projectId,
          number,
          subject: dto.subject,
          purposeCode: dto.purposeCode,
          deliveryMethod: dto.deliveryMethod,
          recipientClientId: dto.recipientClientId ?? access.project.clientId,
          recipientName: dto.recipientName,
          recipientEmails: [...new Set(dto.recipientEmails ?? [])],
          ccEmails: [...new Set(dto.ccEmails ?? [])],
          message: dto.message ?? null,
          createdById: user.id,
          createdAt: this.clock.now(),
        },
      });
      for (const [i, item] of (dto.items ?? []).entries())
        await this.insertItem(tx, id, projectId, item, i);
      await this.audit.record(tx, {
        action: 'transmittal.create',
        entityType: 'Transmittal',
        entityId: id,
        projectId,
        summary: `${number} ${dto.subject}`,
      });
      await this.touch(tx, projectId, id);
      return id;
    });
    return this.get(user, id);
  }

  private async assertRecipientClient(tx: Tx, clientId: string | null | undefined): Promise<void> {
    if (!clientId) return;
    const c = await tx.client.findFirst({
      where: { id: clientId, ...notDeleted },
      select: { id: true },
    });
    if (!c)
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'recipientClientId', code: 'NOT_FOUND' }],
      });
  }

  /** BR-DOC-060: approved/issued, shareable revision of this project, not yet in the transmittal. */
  private async insertItem(
    tx: Tx,
    transmittalId: string,
    projectId: string,
    item: TransmittalItemInputDto,
    sortOrder: number,
  ): Promise<string> {
    const rev = await tx.documentRevision.findUnique({
      where: { id: item.revisionId },
      include: {
        document: { select: { projectId: true, confidentiality: true, deletedAt: true } },
      },
    });
    const problem = rev
      ? itemProblem(
          {
            status: rev.status,
            projectId: rev.document.projectId,
            confidentiality: rev.document.confidentiality,
          },
          projectId,
        )
      : 'NOT_FOUND';
    if (problem === 'NOT_FOUND') {
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'revisionId', code: 'NOT_FOUND' }],
      });
    }
    if (problem) throw new Problem(problem, { rule: 'BR-DOC-060' });
    const dup = await tx.transmittalItem.findUnique({
      where: { transmittalId_revisionId: { transmittalId, revisionId: item.revisionId } },
    });
    if (dup) throw new Problem('TRN_DUPLICATE_ITEM', { rule: 'BR-DOC-060' });
    const id = this.ids.next();
    await tx.transmittalItem.create({
      data: {
        id,
        transmittalId,
        revisionId: item.revisionId,
        copies: item.copies ?? 1,
        format: item.format ?? 'PDF',
        remark: item.remark ?? null,
        sortOrder,
      },
    });
    return id;
  }

  async update(user: AuthUser, id: string, dto: UpdateTransmittalDto): Promise<TransmittalDto> {
    await this.prisma.$transaction(async (tx) => {
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      assertEditable(t.status);
      await this.assertRecipientClient(tx, dto.recipientClientId);
      const res = await tx.transmittal.updateMany({
        where: { id, version: dto.version },
        data: {
          subject: dto.subject,
          purposeCode: dto.purposeCode,
          deliveryMethod: dto.deliveryMethod,
          recipientClientId: dto.recipientClientId,
          recipientName: dto.recipientName,
          recipientEmails: dto.recipientEmails ? [...new Set(dto.recipientEmails)] : undefined,
          ccEmails: dto.ccEmails ? [...new Set(dto.ccEmails)] : undefined,
          message: dto.message,
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(res, () => Promise.resolve(true));
      await this.audit.record(tx, {
        action: 'transmittal.update',
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
      });
      await this.touch(tx, t.projectId, id);
    });
    return this.get(user, id);
  }

  async addItem(user: AuthUser, id: string, dto: TransmittalItemInputDto): Promise<TransmittalDto> {
    await this.prisma.$transaction(async (tx) => {
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      assertEditable(t.status);
      const next = t.items.reduce((m, i) => Math.max(m, i.sortOrder + 1), 0);
      await this.insertItem(tx, id, t.projectId, dto, next);
      await tx.transmittal.update({ where: { id }, data: bumpVersion });
      await this.audit.record(tx, {
        action: 'transmittal.item_add',
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
        changes: {
          before: {},
          after: {
            revisionId: dto.revisionId,
            copies: dto.copies ?? null,
            format: dto.format ?? null,
          },
        },
      });
      await this.touch(tx, t.projectId, id);
    });
    return this.get(user, id);
  }

  async updateItem(
    user: AuthUser,
    id: string,
    itemId: string,
    dto: UpdateTransmittalItemDto,
  ): Promise<TransmittalDto> {
    await this.prisma.$transaction(async (tx) => {
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      assertEditable(t.status);
      if (!t.items.some((i) => i.id === itemId)) throw new Problem('NOT_FOUND');
      await tx.transmittalItem.update({
        where: { id: itemId },
        data: { copies: dto.copies, format: dto.format, remark: dto.remark },
      });
      await tx.transmittal.update({ where: { id }, data: bumpVersion });
      const before = t.items.find((i) => i.id === itemId)!;
      await this.audit.record(tx, {
        action: 'transmittal.item_update',
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
        changes: {
          before: { itemId, copies: before.copies, format: before.format, remark: before.remark },
          after: { itemId, copies: dto.copies, format: dto.format, remark: dto.remark },
        },
      });
      await this.touch(tx, t.projectId, id);
    });
    return this.get(user, id);
  }

  async removeItem(user: AuthUser, id: string, itemId: string): Promise<TransmittalDto> {
    await this.prisma.$transaction(async (tx) => {
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      assertEditable(t.status);
      if (!t.items.some((i) => i.id === itemId)) throw new Problem('NOT_FOUND');
      await tx.transmittalItem.delete({ where: { id: itemId } });
      await tx.transmittal.update({ where: { id }, data: bumpVersion });
      const removed = t.items.find((i) => i.id === itemId)!;
      await this.audit.record(tx, {
        action: 'transmittal.item_remove',
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
        changes: { before: { itemId, revisionId: removed.revisionId }, after: {} },
      });
      await this.touch(tx, t.projectId, id);
    });
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string, dto: CancelTransmittalDto): Promise<TransmittalDto> {
    await this.prisma.$transaction(async (tx) => {
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      const to = assertTransmittalTransition(t.status, 'cancel');
      const res = await tx.transmittal.updateMany({
        where: { id, version: dto.version },
        data: {
          status: to,
          cancelledAt: this.clock.now(),
          cancelReason: dto.reason,
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(res, () => Promise.resolve(true));
      await this.audit.record(tx, {
        action: 'transmittal.cancel',
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
        reason: dto.reason,
      });
      await this.touch(tx, t.projectId, id);
    });
    return this.get(user, id);
  }

  // ───────────────────────── send ─────────────────────────

  /**
   * DRAFT → SENT (docs/05-workflows.md §4): BR-DOC-060 re-check, BR-DOC-062 attachment limit,
   * BR-DOC-063 revisions ISSUED + plan actual dates; PDFs and email go out from the worker.
   */
  async send(user: AuthUser, id: string, dto: TransmittalVersionDto): Promise<SendResultDto> {
    const warnings: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM transmittals WHERE id = ${id}::uuid FOR UPDATE`;
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      const to = assertTransmittalTransition(t.status, 'send');
      if (t.version !== dto.version) throw new Problem('CONFLICT_STALE_VERSION');
      if (!t.items.length) throw new Problem('TRN_NO_ITEMS');
      if (isEmail(t.deliveryMethod) && !t.recipientEmails.length)
        throw new Problem('TRN_NO_RECIPIENT');
      for (const i of t.items) {
        const problem = itemProblem(this.revFacts(i), t.projectId);
        if (problem)
          throw new Problem(problem === 'NOT_FOUND' ? 'TRN_ITEM_NOT_APPROVED' : problem, {
            rule: 'BR-DOC-060',
          });
        if (i.revision.document.latestApprovedRevisionId !== i.revisionId)
          warnings.push('NOT_LATEST_REVISION');
      }
      const now = this.clock.now();
      const totalBytes = t.items.reduce((n, i) => n + itemBytes(i), 0);
      const method = effectiveDelivery(
        t.deliveryMethod,
        totalBytes,
        await this.settings.get('transmittal.maxAttachmentMb'),
      );
      if (method !== t.deliveryMethod) warnings.push('SWITCHED_TO_LINK');
      let link: { publicTokenHash: string; linkExpiresAt: Date } | null = null;
      if (method === 'EMAIL_LINK') {
        const days = await this.settings.get('transmittal.linkExpiryDays');
        link = {
          publicTokenHash: sha256Hex(publicToken(this.linkKey(), id, now.toISOString())),
          linkExpiresAt: new Date(now.getTime() + days * 86_400_000),
        };
      }
      await tx.transmittal.update({
        where: { id },
        data: {
          status: to,
          deliveryMethod: method,
          sentAt: now,
          sentById: user.id,
          ...(link ?? {}),
          ...bumpVersion,
        },
      });
      // BR-DOC-063: APPROVED → ISSUED; plan actual date of the transmittal purpose
      const today = fromDateOnly(bangkokDate(now));
      for (const i of t.items) {
        if (i.revision.status === 'APPROVED') {
          await tx.documentRevision.update({
            where: { id: i.revisionId },
            data: { status: 'ISSUED', issuedAt: i.revision.issuedAt ?? now, ...bumpVersion },
          });
        }
        await tx.documentPlan.updateMany({
          where: {
            documentId: i.revision.document.id,
            purposeCode: t.purposeCode,
            actualDate: null,
          },
          data: { actualDate: today },
        });
        await this.changes.touch(tx, Scope.project(t.projectId), 'DocumentRevision', i.revisionId);
        await this.changes.touch(
          tx,
          Scope.project(t.projectId),
          'Document',
          i.revision.document.id,
        );
      }
      await this.audit.record(tx, {
        action: 'transmittal.send',
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
        summary: `${t.number} → ${t.recipientName} (${method}, ${t.items.length} items)`,
      });
      await this.touch(tx, t.projectId, id);
      await this.outbox.publish(
        tx,
        'transmittal.sent',
        { transmittalId: id, projectId: t.projectId },
        id,
      );
    });
    return { ...(await this.get(user, id)), warnings: [...new Set(warnings)] };
  }

  async acknowledge(user: AuthUser, id: string, dto: AcknowledgeDto): Promise<TransmittalDto> {
    await this.prisma.$transaction(async (tx) => {
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      const to = assertTransmittalTransition(t.status, 'acknowledge');
      if (t.sentAt && dto.acknowledgedAt < bangkokDate(t.sentAt)) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'acknowledgedAt', code: 'BEFORE_SENT' }],
        });
      }
      if (dto.fileId) await this.files.assertUsable(user, dto.fileId, { tx });
      const res = await tx.transmittal.updateMany({
        where: { id, version: dto.version },
        data: {
          status: to,
          acknowledgedAt: fromDateOnly(dto.acknowledgedAt),
          acknowledgedNote: dto.note ?? null,
          acknowledgedById: user.id,
          acknowledgementFileId: dto.fileId ?? null,
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(res, () => Promise.resolve(true));
      await this.audit.record(tx, {
        action: 'transmittal.acknowledge',
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
        summary: dto.acknowledgedAt,
      });
      await this.touch(tx, t.projectId, id);
    });
    return this.get(user, id);
  }

  /** BR-DOC-064: client return code per item, copied to the revision; CODE_3/4 notify. */
  async clientResponse(
    user: AuthUser,
    itemId: string,
    dto: ClientResponseDto,
  ): Promise<TransmittalDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const item = await tx.transmittalItem.findUnique({ where: { id: itemId } });
      if (!item) throw new Problem('NOT_FOUND');
      const { t, access } = await this.load(user, item.transmittalId, tx);
      this.requireManage(user, access);
      if (t.status !== 'SENT' && t.status !== 'ACKNOWLEDGED') {
        throw new Problem('INVALID_STATE_TRANSITION', { extra: { status: t.status } });
      }
      if (dto.fileId) await this.files.assertUsable(user, dto.fileId, { tx });
      const returned = fromDateOnly(dto.returnedAt);
      await tx.transmittalItem.update({
        where: { id: itemId },
        data: {
          clientReturnCode: dto.code,
          clientReturnedAt: returned,
          clientResponseNote: dto.note ?? null,
          clientCommentFileId: dto.fileId ?? null,
          recordedById: user.id,
        },
      });
      const rev = await tx.documentRevision.update({
        where: { id: item.revisionId },
        data: { clientReturnCode: dto.code, clientReturnedAt: returned, ...bumpVersion },
        select: { documentId: true },
      });
      await tx.transmittal.update({ where: { id: t.id }, data: bumpVersion });
      await this.audit.record(tx, {
        action: 'transmittal.client_response',
        entityType: 'TransmittalItem',
        entityId: itemId,
        projectId: t.projectId,
        summary: `${t.number}: ${dto.code}`,
      });
      await this.touch(tx, t.projectId, t.id);
      await this.changes.touch(tx, Scope.project(t.projectId), 'DocumentRevision', item.revisionId);
      if (dto.code === 'CODE_3' || dto.code === 'CODE_4') {
        await this.outbox.publish(
          tx,
          'transmittal.client_response_recorded',
          {
            transmittalId: t.id,
            itemId,
            revisionId: item.revisionId,
            documentId: rev.documentId,
            projectId: t.projectId,
            code: dto.code,
          },
          itemId,
        );
      }
      return t.id;
    });
    return this.get(user, id);
  }

  // ───────────────────────── link and email ─────────────────────────

  async revokeLink(
    user: AuthUser,
    id: string,
    dto: TransmittalVersionDto,
  ): Promise<TransmittalDto> {
    return this.linkChange(user, id, dto.version, 'revoke');
  }

  async extendLink(user: AuthUser, id: string, dto: ExtendLinkDto): Promise<TransmittalDto> {
    return this.linkChange(user, id, dto.version, 'extend', dto.days);
  }

  private async linkChange(
    user: AuthUser,
    id: string,
    version: number,
    kind: 'revoke' | 'extend',
    days?: number,
  ): Promise<TransmittalDto> {
    await this.prisma.$transaction(async (tx) => {
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      if (!t.publicTokenHash || (t.status !== 'SENT' && t.status !== 'ACKNOWLEDGED')) {
        throw new Problem('INVALID_STATE_TRANSITION', { extra: { status: t.status } });
      }
      const now = this.clock.now();
      const n = days ?? (await this.settings.get('transmittal.linkExpiryDays'));
      const res = await tx.transmittal.updateMany({
        where: { id, version },
        data:
          kind === 'revoke'
            ? { linkRevokedAt: now, ...bumpVersion }
            : {
                linkRevokedAt: null,
                linkExpiresAt: new Date(now.getTime() + n * 86_400_000),
                ...bumpVersion,
              },
      });
      await assertVersionedUpdate(res, () => Promise.resolve(true));
      await this.audit.record(tx, {
        action: `transmittal.${kind}_link`,
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
      });
      await this.touch(tx, t.projectId, id);
    });
    return this.get(user, id);
  }

  async resendEmail(
    user: AuthUser,
    id: string,
    dto: TransmittalVersionDto,
  ): Promise<TransmittalDto> {
    await this.prisma.$transaction(async (tx) => {
      const { t, access } = await this.load(user, id, tx);
      this.requireManage(user, access);
      if ((t.status !== 'SENT' && t.status !== 'ACKNOWLEDGED') || !isEmail(t.deliveryMethod)) {
        throw new Problem('INVALID_STATE_TRANSITION', { extra: { status: t.status } });
      }
      if (t.version !== dto.version) throw new Problem('CONFLICT_STALE_VERSION');
      await this.audit.record(tx, {
        action: 'transmittal.resend_email',
        entityType: 'Transmittal',
        entityId: id,
        projectId: t.projectId,
      });
      await this.outbox.publish(
        tx,
        'transmittal.resend_requested',
        { transmittalId: id, projectId: t.projectId, requestedAt: this.clock.now().toISOString() },
        id,
      );
    });
    return this.get(user, id);
  }

  /** Cover sheet download; drafts get a preview rendered by the worker on demand later — here: the stored PDF. */
  async coverSheet(user: AuthUser, id: string): Promise<{ url: string; expiresAt: string }> {
    const { t } = await this.load(user, id);
    if (!t.coverSheetFileId) throw new Problem('FILE_NOT_UPLOADED');
    return this.files.downloadUrl(user, t.coverSheetFileId);
  }

  // ───────────────────────── public page (BR-DOC-065) ─────────────────────────

  async findByToken(token: string) {
    const t = await this.prisma.transmittal.findUnique({
      where: { publicTokenHash: sha256Hex(token) },
      include: {
        items: { include: itemInclude, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        project: { select: { name: true } },
        sentBy: { select: { displayNameTh: true, email: true } },
      },
    });
    if (!t) throw new Problem('NOT_FOUND');
    if (!linkUsable(t, this.clock.now())) {
      // the page tells the client whom to contact (docs/07-web-ui.md §7)
      throw new Problem('TRN_LINK_EXPIRED', {
        rule: 'BR-DOC-065',
        extra: { number: t.number, senderEmail: t.sentBy?.email ?? null },
      });
    }
    return t;
  }

  private async touch(tx: Tx, projectId: string, id: string): Promise<void> {
    await this.changes.touch(tx, Scope.project(projectId), 'Transmittal', id);
  }
}
