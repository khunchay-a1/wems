import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ChangeLogService, Scope } from '../../common/audit/change-log.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { Problem } from '../../common/errors/problem';
import { FileAccessRegistry } from '../../common/files/file-access.registry';
import { FilesService, toFileView } from '../../common/files/files.service';
import { StorageService } from '../../common/files/storage.service';
import { IdGenerator } from '../../common/ids/id-generator';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  assertVersionedUpdate,
  bumpVersion,
  iso,
  notDeleted,
  toDateOnly,
  type Tx,
} from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClockService } from '../../common/time/clock';
import { documentsEditable } from '../projects/domain/project-state-machine';
import { DocumentAccessService, type RevisionContext } from './document-access.service';
import { RevisionStampService } from './revision-stamp.service';
import { isValidLabel, nextRevisionLabel } from './domain/revision-label';
import {
  assertRevisionTransition,
  canDiscard,
  isInProgress,
} from './domain/revision-state-machine';
import type {
  AddRevisionFileDto,
  CreateRevisionDto,
  DownloadQueryDto,
  ReviewCycleDto,
  RevisionDto,
  SignedUrlResultDto,
  UpdateRevisionDto,
  VersionReasonBodyDto,
} from './dto/revisions.dto';

const userRef = { select: { id: true, displayNameTh: true } } as const;

export const revisionInclude = {
  document: {
    select: {
      id: true,
      projectId: true,
      number: true,
      title: true,
      latestApprovedRevisionId: true,
    },
  },
  preparedBy: userRef,
  checkedBy: userRef,
  approvedBy: userRef,
  files: {
    include: { file: true, uploadedBy: userRef },
    orderBy: [{ uploadedAt: 'desc' }],
  },
  reviewCycles: {
    include: {
      submittedBy: userRef,
      steps: {
        include: { assignee: userRef },
        orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { cycleNo: 'desc' },
  },
} satisfies Prisma.DocumentRevisionInclude;

export type RevisionRow = Prisma.DocumentRevisionGetPayload<{ include: typeof revisionInclude }>;
type CycleRow = RevisionRow['reviewCycles'][number];

const ref = (u: { id: string; displayNameTh: string } | null) =>
  u ? { id: u.id, displayName: u.displayNameTh } : null;

/** Revisions and their files (BR-DOC-020..027, BR-DOC-070/071; docs/05-workflows.md §1). */
@Injectable()
export class RevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly changes: ChangeLogService,
    private readonly outbox: OutboxService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
    private readonly docAccess: DocumentAccessService,
    private readonly files: FilesService,
    private readonly storage: StorageService,
    private readonly revStamps: RevisionStampService,
    registry: FileAccessRegistry,
  ) {
    // Files of a revision are readable by everyone who can read the document
    registry.registerReader(async (user, fileId) => {
      const df = await this.prisma.documentFile.findFirst({
        where: { fileId },
        select: { revisionId: true },
      });
      if (!df) return false;
      try {
        await this.docAccess.revision(user, df.revisionId);
        return true;
      } catch {
        return false;
      }
    });
  }

  // ───────────────────────── read ─────────────────────────

  async get(user: AuthUser, id: string): Promise<RevisionDto> {
    const ctx = await this.docAccess.revision(user, id);
    const row = await this.prisma.documentRevision.findUniqueOrThrow({
      where: { id },
      include: revisionInclude,
    });
    return this.toDto(user, ctx, row);
  }

  async list(user: AuthUser, documentId: string): Promise<RevisionDto[]> {
    const { doc, access } = await this.docAccess.document(user, documentId);
    const rows = await this.prisma.documentRevision.findMany({
      where: { documentId },
      include: revisionInclude,
      orderBy: { revIndex: 'desc' },
    });
    return Promise.all(rows.map((r) => this.toDto(user, { doc, access, rev: r }, r)));
  }

  async toDto(user: AuthUser, ctx: RevisionContext, r: RevisionRow): Promise<RevisionDto> {
    const [commentCount, openCommentCount] = await Promise.all([
      this.prisma.comment.count({
        where: { ownerType: 'DOCUMENT_REVISION', ownerId: r.id, parentId: null, ...notDeleted },
      }),
      this.prisma.comment.count({
        where: {
          ownerType: 'DOCUMENT_REVISION',
          ownerId: r.id,
          parentId: null,
          status: { in: ['OPEN', 'RESPONDED'] },
          ...notDeleted,
        },
      }),
    ]);
    const { allowed, blocked } = await this.actions(user, ctx, r, commentCount);
    const now = this.clock.now();
    const delegators = [
      ...new Set(
        r.reviewCycles
          .flatMap((c) => c.steps.map((s) => s.delegatedFromUserId))
          .filter((x): x is string => !!x),
      ),
    ];
    const names = new Map(
      (delegators.length
        ? await this.prisma.user.findMany({
            where: { id: { in: delegators } },
            select: { id: true, displayNameTh: true },
          })
        : []
      ).map((u) => [u.id, u.displayNameTh]),
    );
    return {
      id: r.id,
      documentId: r.documentId,
      projectId: r.document.projectId,
      documentNumber: r.document.number,
      documentTitle: r.document.title,
      revLabel: r.revLabel,
      revIndex: r.revIndex,
      purposeCode: r.purposeCode,
      status: r.status,
      description: r.description,
      preparedBy: ref(r.preparedBy)!,
      checkedBy: ref(r.checkedBy),
      approvedBy: ref(r.approvedBy),
      approvedAt: iso(r.approvedAt),
      issuedAt: iso(r.issuedAt),
      lockedAt: iso(r.lockedAt),
      lastCycleOutcome: r.lastCycleOutcome,
      clientReturnCode: r.clientReturnCode,
      clientReturnedAt: toDateOnly(r.clientReturnedAt),
      voidedAt: iso(r.voidedAt),
      voidReason: r.voidReason,
      isLatestApproved: r.document.latestApprovedRevisionId === r.id,
      files: r.files.map((f) => ({
        id: f.id,
        role: f.role,
        uploadVersion: f.uploadVersion,
        isCurrent: f.isCurrent,
        note: f.note,
        uploadedBy: ref(f.uploadedBy)!,
        uploadedAt: f.uploadedAt.toISOString(),
        file: toFileView(f.file),
      })),
      cycles: r.reviewCycles.map((c) => toCycleDto(c, user, ctx, now, names)),
      commentCount,
      openCommentCount,
      version: r.version,
      allowedActions: allowed,
      blockedActions: blocked,
    };
  }

  /** allowedActions/blockedActions of a revision — same rules as the guards below. */
  private async actions(
    user: AuthUser,
    ctx: RevisionContext,
    r: RevisionRow,
    commentCount: number,
  ): Promise<{ allowed: string[]; blocked: { action: string; code: string }[] }> {
    const allowed: string[] = ['download'];
    const blocked: { action: string; code: string }[] = [];
    const isPreparer = r.preparedById === user.id;
    const canEdit = isPreparer || user.permissions.has('document.edit');
    const isAdmin = user.permissions.has('document.admin');
    const editable = documentsEditable(ctx.access.project.status) && ctx.doc.status === 'ACTIVE';
    if (user.permissions.has('document.edit')) allowed.push('downloadUnstamped');
    if (r.status === 'DRAFT' && canEdit) {
      if (!editable) {
        blocked.push({ action: 'submit', code: 'DOC_PROJECT_NOT_EDITABLE' });
      } else {
        allowed.push('upload', 'edit');
        const reason = await this.submitBlocker(ctx, r);
        if (reason) blocked.push({ action: 'submit', code: reason });
        else allowed.push('submit');
      }
      if (canDiscard({ status: r.status, cycles: r.reviewCycles.length, comments: commentCount })) {
        if (isPreparer || isAdmin) allowed.push('discard');
      } else if (isPreparer || isAdmin) {
        allowed.push('void');
      }
    }
    if (r.status === 'IN_REVIEW') {
      const cycle = r.reviewCycles.find((c) => c.status === 'IN_PROGRESS');
      if (cycle && (cycle.submittedById === user.id || ctx.access.isProjectManager || isAdmin)) {
        allowed.push('cancelReview');
      }
    }
    if ((r.status === 'APPROVED' || r.status === 'ISSUED') && isAdmin) allowed.push('void');
    allowed.push('comment');
    return { allowed, blocked };
  }

  /** First unmet BR-DOC-030 precondition that does not depend on the chosen assignees. */
  async submitBlocker(
    ctx: { doc: { documentTypeId: string } },
    r: { id: string; revIndex: number; description: string | null },
    tx: Tx = this.prisma,
  ): Promise<string | null> {
    const type = await tx.documentType.findUniqueOrThrow({ where: { id: ctx.doc.documentTypeId } });
    if (type.requiresPdfRendition) {
      const pdf = await tx.documentFile.findFirst({
        where: { revisionId: r.id, role: 'PDF_RENDITION', isCurrent: true },
        include: { file: true },
      });
      if (!pdf) return 'DOC_PDF_RENDITION_REQUIRED';
      if (pdf.file.status !== 'AVAILABLE') return 'DOC_FILE_NOT_AVAILABLE';
    }
    if (r.revIndex > 1 && !r.description?.trim()) return 'DOC_REVISION_DESCRIPTION_REQUIRED';
    return null;
  }

  // ───────────────────────── create ─────────────────────────

  async create(user: AuthUser, documentId: string, dto: CreateRevisionDto): Promise<RevisionDto> {
    const id = await this.prisma.$transaction((tx) => this.createInTx(tx, user, documentId, dto));
    return this.get(user, id);
  }

  /** Create a DRAFT revision (docs/05-workflows.md §1 "create"). */
  async createInTx(
    tx: Tx,
    user: AuthUser,
    documentId: string,
    dto: CreateRevisionDto,
  ): Promise<string> {
    const { doc, access } = await this.docAccess.document(user, documentId, tx);
    this.docAccess.require(user, 'document.edit');
    this.docAccess.assertProjectEditable(access);
    if (doc.status !== 'ACTIVE') throw new Problem('DOC_NOT_ACTIVE');
    if (dto.revLabelOverride && !user.permissions.has('document.admin')) {
      throw new Problem('FORBIDDEN', { rule: 'BR-DOC-024' });
    }
    // serialise revision creation per document
    await tx.$queryRaw`SELECT id FROM documents WHERE id = ${documentId}::uuid FOR UPDATE`;
    const existing = await tx.documentRevision.findMany({
      where: { documentId },
      select: { id: true, revLabel: true, status: true },
    });
    if (existing.some((r) => isInProgress(r.status))) {
      throw new Problem('DOC_REVISION_IN_PROGRESS', { rule: 'BR-DOC-021' });
    }
    let label: string;
    if (dto.revLabelOverride) {
      // BR-DOC-024 (permission checked above)
      if (
        !isValidLabel(access.project.revisionScheme, dto.revLabelOverride) ||
        existing.some((r) => r.revLabel === dto.revLabelOverride)
      ) {
        throw new Problem('DOC_REV_LABEL_INVALID', {
          rule: 'BR-DOC-024',
          errors: [{ field: 'revLabelOverride', code: 'INVALID' }],
        });
      }
      label = dto.revLabelOverride;
    } else {
      label = nextRevisionLabel(
        access.project.revisionScheme,
        existing.map((r) => ({
          label: r.revLabel,
          state: r.status === 'VOID' ? 'VOID' : 'ACTIVE',
        })),
        dto.purposeCode,
      );
    }
    const id = this.ids.next();
    await tx.documentRevision.create({
      data: {
        id,
        documentId,
        revLabel: label,
        revIndex: existing.length + 1,
        purposeCode: dto.purposeCode,
        description: dto.description || null,
        preparedById: user.id,
        createdById: user.id,
      },
    });
    await tx.document.update({
      where: { id: documentId },
      data: { currentRevisionId: id, ...bumpVersion },
    });
    const carried = await this.carryOverComments(tx, user, documentId, id, label);
    await this.audit.record(tx, {
      action: 'document.revision.create',
      entityType: 'DocumentRevision',
      entityId: id,
      projectId: doc.projectId,
      summary: `${doc.number} Rev.${label} (${dto.purposeCode})${carried ? ` +${carried} comments` : ''}`,
    });
    await this.touch(tx, doc.projectId, documentId, id);
    await this.outbox.publish(
      tx,
      'revision.created',
      { revisionId: id, documentId, projectId: doc.projectId },
      id,
    );
    return id;
  }

  /**
   * BR-DOC-034: OPEN/RESPONDED review comments of earlier revisions are copied as OPEN into the new
   * revision (with replies dropped) and the originals close.
   */
  private async carryOverComments(
    tx: Tx,
    user: AuthUser,
    documentId: string,
    revisionId: string,
    label: string,
  ): Promise<number> {
    const earlier = await tx.documentRevision.findMany({
      where: { documentId, id: { not: revisionId } },
      select: { id: true },
    });
    if (!earlier.length) return 0;
    const open = await tx.comment.findMany({
      where: {
        ownerType: 'DOCUMENT_REVISION',
        ownerId: { in: earlier.map((r) => r.id) },
        parentId: null,
        status: { in: ['OPEN', 'RESPONDED'] },
        ...notDeleted,
      },
      orderBy: { createdAt: 'asc' },
    });
    const now = this.clock.now();
    for (const c of open) {
      await tx.comment.create({
        data: {
          id: this.ids.next(),
          ownerType: 'DOCUMENT_REVISION',
          ownerId: revisionId,
          authorId: c.authorId,
          body: c.body,
          mentions: c.mentions,
          anchor: c.anchor ?? undefined,
          status: 'OPEN',
          reviewStepId: c.reviewStepId,
          carriedFromCommentId: c.id,
          responseNote: c.responseNote,
          createdAt: now,
        },
      });
      await tx.comment.update({
        where: { id: c.id },
        data: {
          status: 'CLOSED',
          resolvedById: user.id,
          resolvedAt: now,
          responseNote: c.responseNote ?? `→ Rev.${label}`,
          ...bumpVersion,
        },
      });
    }
    return open.length;
  }

  private async touch(
    tx: Tx,
    projectId: string,
    documentId: string,
    revisionId: string,
  ): Promise<void> {
    await this.changes.touch(tx, Scope.project(projectId), 'DocumentRevision', revisionId);
    await this.changes.touch(tx, Scope.project(projectId), 'Document', documentId);
  }

  /** Preparer or document.edit (docs/06-security.md §3 "ผู้จัดทำแก้ revision ของตน"). */
  private assertCanEdit(user: AuthUser, ctx: RevisionContext): void {
    if (ctx.rev.preparedById !== user.id && !user.permissions.has('document.edit')) {
      throw new Problem('FORBIDDEN');
    }
  }

  // ───────────────────────── update / discard / void ─────────────────────────

  async update(user: AuthUser, id: string, dto: UpdateRevisionDto): Promise<RevisionDto> {
    await this.prisma.$transaction(async (tx) => {
      const ctx = await this.docAccess.revision(user, id, tx);
      this.assertCanEdit(user, ctx);
      this.docAccess.assertProjectEditable(ctx.access);
      assertRevisionTransition(ctx.rev.status, 'edit');
      let revLabel: string | undefined;
      if (dto.purposeCode && dto.purposeCode !== ctx.rev.purposeCode) {
        const cycles = await tx.reviewCycle.count({ where: { revisionId: id } });
        if (cycles) throw new Problem('DOC_REVISION_LOCKED', { rule: 'BR-DOC-026' });
        const others = await tx.documentRevision.findMany({
          where: { documentId: ctx.doc.id, id: { not: id } },
          select: { revLabel: true, status: true },
        });
        revLabel = nextRevisionLabel(
          ctx.access.project.revisionScheme,
          others.map((r) => ({
            label: r.revLabel,
            state: r.status === 'VOID' ? 'VOID' : 'ACTIVE',
          })),
          dto.purposeCode,
        );
      }
      const data = {
        ...(dto.purposeCode ? { purposeCode: dto.purposeCode } : {}),
        ...(revLabel ? { revLabel } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
      };
      const res = await tx.documentRevision.updateMany({
        where: { id, version: dto.version, status: 'DRAFT' },
        data: { ...data, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.get(user, id),
      );
      await this.audit.record(tx, {
        action: 'document.revision.update',
        entityType: 'DocumentRevision',
        entityId: id,
        projectId: ctx.doc.projectId,
        changes: {
          before: {
            purposeCode: ctx.rev.purposeCode,
            revLabel: ctx.rev.revLabel,
            description: ctx.rev.description,
          },
          after: data,
        },
      });
      await this.touch(tx, ctx.doc.projectId, ctx.doc.id, id);
    });
    return this.get(user, id);
  }

  /** The newest revision that is not VOID becomes the document's current one. */
  private async repointCurrent(tx: Tx, documentId: string): Promise<void> {
    const prev = await tx.documentRevision.findFirst({
      where: { documentId, status: { not: 'VOID' } },
      orderBy: { revIndex: 'desc' },
      select: { id: true },
    });
    await tx.document.update({
      where: { id: documentId },
      data: { currentRevisionId: prev?.id ?? null, ...bumpVersion },
    });
  }

  /** BR-DOC-025 discard: the only real delete of a revision; its label can be used again. */
  async discard(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const ctx = await this.docAccess.revision(user, id, tx);
      if (ctx.rev.preparedById !== user.id && !user.permissions.has('document.admin')) {
        throw new Problem('FORBIDDEN', { rule: 'BR-DOC-025' });
      }
      const [cycles, comments] = await Promise.all([
        tx.reviewCycle.count({ where: { revisionId: id } }),
        tx.comment.count({ where: { ownerType: 'DOCUMENT_REVISION', ownerId: id } }),
      ]);
      if (!canDiscard({ status: ctx.rev.status, cycles, comments })) {
        throw new Problem('DOC_CANNOT_DISCARD', { rule: 'BR-DOC-025' });
      }
      await tx.documentFile.deleteMany({ where: { revisionId: id } });
      await tx.document.update({ where: { id: ctx.doc.id }, data: { currentRevisionId: null } });
      await tx.documentRevision.delete({ where: { id } });
      // later revisions cannot exist (only one draft at a time), so indexes stay contiguous
      await this.repointCurrent(tx, ctx.doc.id);
      await this.audit.record(tx, {
        action: 'document.revision.discard',
        entityType: 'DocumentRevision',
        entityId: id,
        projectId: ctx.doc.projectId,
        summary: `${ctx.doc.number} Rev.${ctx.rev.revLabel}`,
      });
      await this.changes.touch(
        tx,
        Scope.project(ctx.doc.projectId),
        'DocumentRevision',
        id,
        'DELETE',
      );
      await this.changes.touch(tx, Scope.project(ctx.doc.projectId), 'Document', ctx.doc.id);
      await this.outbox.publish(
        tx,
        'revision.discarded',
        { revisionId: id, documentId: ctx.doc.id, projectId: ctx.doc.projectId },
        id,
      );
    });
  }

  /** void (docs/05-workflows.md §1): drafts by the preparer/admin, approved/issued by document.admin. */
  async void(user: AuthUser, id: string, dto: VersionReasonBodyDto): Promise<RevisionDto> {
    await this.prisma.$transaction(async (tx) => {
      const ctx = await this.docAccess.revision(user, id, tx);
      const isAdmin = user.permissions.has('document.admin');
      const { rev, doc } = ctx;
      if (rev.status === 'DRAFT') {
        if (rev.preparedById !== user.id && !isAdmin) throw new Problem('FORBIDDEN');
        const [cycles, comments] = await Promise.all([
          tx.reviewCycle.count({ where: { revisionId: id } }),
          tx.comment.count({ where: { ownerType: 'DOCUMENT_REVISION', ownerId: id } }),
        ]);
        if (canDiscard({ status: rev.status, cycles, comments })) {
          throw new Problem('INVALID_STATE_TRANSITION', {
            rule: 'BR-DOC-025',
            extra: { hint: 'discard' },
          });
        }
      } else if (!isAdmin) {
        throw new Problem('FORBIDDEN');
      }
      assertRevisionTransition(rev.status, 'void');
      const res = await tx.documentRevision.updateMany({
        where: { id, version: dto.version, status: rev.status },
        data: {
          status: 'VOID',
          voidedAt: this.clock.now(),
          voidedById: user.id,
          voidReason: dto.reason,
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.get(user, id),
      );
      if (doc.currentRevisionId === id) await this.repointCurrent(tx, doc.id);
      if (doc.latestApprovedRevisionId === id) {
        const latest = await tx.documentRevision.findFirst({
          where: { documentId: doc.id, status: { in: ['APPROVED', 'ISSUED'] } },
          orderBy: { revIndex: 'desc' },
          select: { id: true },
        });
        await tx.document.update({
          where: { id: doc.id },
          data: { latestApprovedRevisionId: latest?.id ?? null, ...bumpVersion },
        });
      }
      await this.audit.record(tx, {
        action: 'document.revision.void',
        entityType: 'DocumentRevision',
        entityId: id,
        projectId: doc.projectId,
        summary: `${doc.number} Rev.${rev.revLabel}`,
        changes: { before: { status: rev.status }, after: { status: 'VOID' } },
        reason: dto.reason,
      });
      await this.touch(tx, doc.projectId, doc.id, id);
      await this.outbox.publish(
        tx,
        'revision.voided',
        { revisionId: id, documentId: doc.id, projectId: doc.projectId, wasStatus: rev.status },
        id,
      );
    });
    return this.get(user, id);
  }

  // ───────────────────────── files ─────────────────────────

  /** BR-DOC-026: uploads while DRAFT; PDF/NATIVE keep one current file each (new upload = new version). */
  async addFile(user: AuthUser, id: string, dto: AddRevisionFileDto): Promise<RevisionDto> {
    await this.prisma.$transaction(async (tx) => {
      const ctx = await this.docAccess.revision(user, id, tx);
      this.assertCanEdit(user, ctx);
      this.docAccess.assertProjectEditable(ctx.access);
      assertRevisionTransition(ctx.rev.status, 'upload');
      const file = await this.files.assertUsable(user, dto.fileId, { requireAvailable: false, tx });
      if (dto.role === 'PDF_RENDITION' && file.mimeType !== 'application/pdf') {
        throw new Problem('DOC_FILE_TYPE_MISMATCH', {
          rule: 'BR-DOC-026',
          errors: [{ field: 'fileId', code: 'PDF_REQUIRED' }],
        });
      }
      if (await tx.documentFile.findFirst({ where: { revisionId: id, fileId: dto.fileId } })) {
        throw new Problem('DUPLICATE', { errors: [{ field: 'fileId', code: 'DUPLICATE' }] });
      }
      let uploadVersion = 1;
      if (dto.role !== 'SUPPORTING') {
        const last = await tx.documentFile.findFirst({
          where: { revisionId: id, role: dto.role },
          orderBy: { uploadVersion: 'desc' },
        });
        uploadVersion = (last?.uploadVersion ?? 0) + 1;
        await tx.documentFile.updateMany({
          where: { revisionId: id, role: dto.role, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      await tx.documentFile.create({
        data: {
          id: this.ids.next(),
          revisionId: id,
          fileId: dto.fileId,
          role: dto.role,
          uploadVersion,
          isCurrent: true,
          note: dto.note ?? null,
          uploadedById: user.id,
          uploadedAt: this.clock.now(),
        },
      });
      await tx.documentRevision.update({ where: { id }, data: bumpVersion });
      await this.audit.record(tx, {
        action: 'document.revision.upload',
        entityType: 'DocumentRevision',
        entityId: id,
        projectId: ctx.doc.projectId,
        summary: `${dto.role} v${uploadVersion} ${file.originalName}`,
      });
      await this.touch(tx, ctx.doc.projectId, ctx.doc.id, id);
    });
    return this.get(user, id);
  }

  /** Download URL; PDF renditions are stamped by status (BR-DOC-070/071) and cached by stamp hash. */
  async download(user: AuthUser, id: string, q: DownloadQueryDto): Promise<SignedUrlResultDto> {
    const ctx = await this.docAccess.revision(user, id);
    const role = q.fileRole ?? 'PDF_RENDITION';
    const df = await this.prisma.documentFile.findFirst({
      where: q.documentFileId
        ? { id: q.documentFileId, revisionId: id }
        : { revisionId: id, role, isCurrent: true },
      include: { file: true },
    });
    if (!df || df.file.deletedAt) throw new Problem('NOT_FOUND');
    if (df.file.status !== 'AVAILABLE') throw new Problem('DOC_FILE_NOT_AVAILABLE');
    const stamp = q.stamp ?? true;
    if (!stamp && df.role === 'PDF_RENDITION' && !user.permissions.has('document.edit')) {
      throw new Problem('FORBIDDEN', { rule: 'BR-DOC-071' });
    }
    const baseName = `${ctx.doc.number}_Rev${ctx.rev.revLabel}`;
    if (ctx.doc.confidentiality === 'CONFIDENTIAL') {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'file.download',
          entityType: 'DocumentRevision',
          entityId: id,
          projectId: ctx.doc.projectId,
          summary: df.file.originalName,
        }),
      );
    }
    const original = async () => ({
      ...(await this.files.signedDownload(df.file)),
      sha256: df.file.sha256,
    });
    if (df.role !== 'PDF_RENDITION' || !stamp) return original();
    const stamped = await this.revStamps.stamped(ctx.rev, df.file);
    if (!stamped) return original();
    return {
      ...(await this.files.signedDownload(
        { ...df.file, storageKey: stamped.key, mimeType: 'application/pdf' },
        `${baseName}.pdf`,
      )),
      sha256: stamped.sha256,
    };
  }
}

export function toCycleDto(
  c: CycleRow,
  user: AuthUser,
  ctx: RevisionContext,
  now: Date,
  names: Map<string, string> = new Map(),
): ReviewCycleDto {
  const isAdmin = user.permissions.has('document.admin');
  return {
    id: c.id,
    revisionId: c.revisionId,
    cycleNo: c.cycleNo,
    status: c.status,
    templateId: c.templateId,
    reviewedFileId: c.reviewedFileId,
    reviewedFileSha256: c.reviewedFileSha256,
    submittedBy: ref(c.submittedBy)!,
    submittedAt: c.submittedAt.toISOString(),
    submitNote: c.submitNote,
    completedAt: iso(c.completedAt),
    cancelledReason: c.cancelledReason,
    steps: c.steps.map((s) => {
      const open = s.status === 'ACTIVE' || s.status === 'PENDING';
      const allowed: string[] = [];
      if (s.status === 'ACTIVE' && s.assigneeId === user.id) allowed.push('decide');
      if (open && (s.assigneeId === user.id || ctx.access.isProjectManager || isAdmin))
        allowed.push('reassign');
      if (open && s.isOptional && (ctx.access.isProjectManager || isAdmin)) allowed.push('skip');
      return {
        id: s.id,
        stepOrder: s.stepOrder,
        kind: s.kind,
        name: s.name,
        assignee: ref(s.assignee)!,
        status: s.status,
        requiresSignature: s.requiresSignature,
        requiresLicense: s.requiresLicense,
        isOptional: s.isOptional,
        activatedAt: iso(s.activatedAt),
        dueAt: iso(s.dueAt),
        isOverdue: s.status === 'ACTIVE' && !!s.dueAt && s.dueAt < now,
        decidedAt: iso(s.decidedAt),
        decisionNote: s.decisionNote,
        delegatedFrom: s.delegatedFromUserId
          ? { id: s.delegatedFromUserId, displayName: names.get(s.delegatedFromUserId) ?? '' }
          : null,
        signatureEventId: s.signatureEventId,
        version: s.version,
        allowedActions: allowed,
      };
    }),
  };
}
