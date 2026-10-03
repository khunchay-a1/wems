import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { type Comment, type CommentOwnerType, Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ChangeLogService, Scope } from '../../common/audit/change-log.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { Problem } from '../../common/errors/problem';
import { enumLabel } from '../../common/i18n/enum-labels';
import type { Locale } from '../../common/i18n/locale';
import { IdGenerator } from '../../common/ids/id-generator';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PdfService } from '../../common/pdf/pdf.service';
import {
  assertVersionedUpdate,
  bumpVersion,
  notDeleted,
  type Tx,
} from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { bangkokDate, buddhistYear } from '../../common/time/business-calendar';
import { ClockService } from '../../common/time/clock';
import { DocumentAccessService, type RevisionContext } from './document-access.service';
import type { XlsxFile } from './documents-excel.service';
import { commentActions, isEditable, validAnchor } from './domain/comment-policy';
import { assertCommentTransition } from './domain/comment-state-machine';
import type {
  CommentDto,
  CommentReplyDto,
  CommentStateDto,
  CreateCommentDto,
  PdfAnchorDto,
  RespondCommentDto,
  UpdateCommentDto,
} from './dto/comments.dto';

const userRef = { select: { id: true, displayNameTh: true } } as const;
const commentInclude = {
  author: userRef,
  resolvedBy: userRef,
  reviewStep: {
    select: { id: true, name: true, status: true, cycle: { select: { cycleNo: true } } },
  },
  carriedFrom: { select: { id: true, ownerId: true } },
} satisfies Prisma.CommentInclude;
type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

/** Revisions whose comments no longer change (closed history). */
const FROZEN_REVISION = new Set(['VOID', 'SUPERSEDED']);

interface OwnerCtx {
  rev: RevisionContext;
  projectId: string;
  open: boolean;
  canAnswer: boolean;
}

const excerpt = (s: string) => (s.length > 140 ? `${s.slice(0, 137)}…` : s);

/**
 * PDF comments, replies and the comment resolution sheet (M04 §6, docs/05-workflows.md §3,
 * BR-DOC-033..035). Phase 1 owners: DOCUMENT_REVISION.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly changes: ChangeLogService,
    private readonly outbox: OutboxService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
    private readonly docAccess: DocumentAccessService,
    private readonly pdf: PdfService,
  ) {}

  // ───────────────────────── owner scope ─────────────────────────

  private async owner(
    user: AuthUser,
    ownerType: CommentOwnerType,
    ownerId: string,
    tx?: Tx,
  ): Promise<OwnerCtx> {
    // other owner types arrive with their modules (design basis P1-11, site work phase 2)
    if (ownerType !== 'DOCUMENT_REVISION') throw new Problem('NOT_FOUND');
    const rev = await this.docAccess.revision(user, ownerId, tx);
    return {
      rev,
      projectId: rev.doc.projectId,
      open: !FROZEN_REVISION.has(rev.rev.status),
      canAnswer:
        rev.rev.preparedById === user.id ||
        rev.doc.ownerId === user.id ||
        user.permissions.has('document.edit'),
    };
  }

  private async load(user: AuthUser, id: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const c = await db.comment.findFirst({ where: { id, ...notDeleted }, include: commentInclude });
    if (!c) throw new Problem('NOT_FOUND');
    const owner = await this.owner(user, c.ownerType, c.ownerId, tx);
    return { c, owner };
  }

  // ───────────────────────── read ─────────────────────────

  async list(user: AuthUser, ownerType: CommentOwnerType, ownerId: string): Promise<CommentDto[]> {
    const owner = await this.owner(user, ownerType, ownerId);
    return this.listForOwner(user, owner, ownerType, ownerId);
  }

  async get(user: AuthUser, id: string): Promise<CommentDto> {
    const { c, owner } = await this.load(user, id);
    const all = await this.listForOwner(user, owner, c.ownerType, c.ownerId);
    const top = c.parentId ?? c.id;
    const found = all.find((x) => x.id === top);
    if (!found) throw new Problem('NOT_FOUND');
    return found;
  }

  private async listForOwner(
    user: AuthUser,
    owner: OwnerCtx,
    ownerType: CommentOwnerType,
    ownerId: string,
  ): Promise<CommentDto[]> {
    // numbering counts deleted comments too so "#3" never changes meaning
    const rows = await this.prisma.comment.findMany({
      where: { ownerType, ownerId },
      include: commentInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const carriedRevs = [
      ...new Set(rows.map((r) => r.carriedFrom?.ownerId).filter((x): x is string => !!x)),
    ];
    const labels = new Map(
      (carriedRevs.length
        ? await this.prisma.documentRevision.findMany({
            where: { id: { in: carriedRevs } },
            select: { id: true, revLabel: true },
          })
        : []
      ).map((r) => [r.id, r.revLabel]),
    );
    const replies = new Map<string, CommentRow[]>();
    for (const r of rows) {
      if (r.parentId && !r.deletedAt)
        replies.set(r.parentId, [...(replies.get(r.parentId) ?? []), r]);
    }
    const out: CommentDto[] = [];
    let seq = 0;
    for (const r of rows) {
      if (r.parentId) continue;
      seq += 1;
      if (r.deletedAt) continue;
      out.push(this.toDto(user, owner, r, seq, replies.get(r.id) ?? [], labels));
    }
    return out;
  }

  private toDto(
    user: AuthUser,
    owner: OwnerCtx,
    r: CommentRow,
    seq: number,
    replies: CommentRow[],
    labels: Map<string, string>,
  ): CommentDto {
    const { allowed, blocked } = commentActions({
      status: r.status,
      isAuthor: r.authorId === user.id,
      stepStatus: r.reviewStep?.status ?? null,
      ownerOpen: owner.open,
      canAnswer: owner.canAnswer,
      isDocumentAdmin: user.permissions.has('document.admin'),
    });
    return {
      id: r.id,
      seq,
      ownerType: r.ownerType,
      ownerId: r.ownerId,
      author: { id: r.author.id, displayName: r.author.displayNameTh },
      body: r.body,
      mentions: r.mentions,
      anchor: (r.anchor as PdfAnchorDto | null) ?? null,
      status: r.status,
      reviewStepId: r.reviewStepId,
      stepName: r.reviewStep?.name ?? null,
      cycleNo: r.reviewStep?.cycle.cycleNo ?? null,
      responseNote: r.responseNote,
      resolvedBy: r.resolvedBy
        ? { id: r.resolvedBy.id, displayName: r.resolvedBy.displayNameTh }
        : null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      carriedFromCommentId: r.carriedFromCommentId,
      carriedFromRevLabel: r.carriedFrom ? (labels.get(r.carriedFrom.ownerId) ?? null) : null,
      replies: replies.map((x) => this.toReply(user, owner, x)),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      version: r.version,
      allowedActions: allowed,
      blockedActions: blocked,
    };
  }

  private toReply(user: AuthUser, owner: OwnerCtx, r: CommentRow): CommentReplyDto {
    return {
      id: r.id,
      author: { id: r.author.id, displayName: r.author.displayNameTh },
      body: r.body,
      mentions: r.mentions,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      version: r.version,
      allowedActions: owner.open && r.authorId === user.id ? ['edit', 'delete'] : [],
    };
  }

  // ───────────────────────── write ─────────────────────────

  async create(user: AuthUser, dto: CreateCommentDto): Promise<CommentDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const owner = await this.owner(user, dto.ownerType, dto.ownerId, tx);
      if (!owner.open) throw new Problem('DOC_COMMENT_NOT_EDITABLE');
      let status: Comment['status'] = 'NONE';
      let reviewStepId: string | null = null;
      if (dto.parentId) {
        const parent = await tx.comment.findFirst({
          where: { id: dto.parentId, ...notDeleted },
          select: { ownerType: true, ownerId: true, parentId: true },
        });
        if (
          !parent ||
          parent.ownerType !== dto.ownerType ||
          parent.ownerId !== dto.ownerId ||
          parent.parentId
        ) {
          throw new Problem('VALIDATION_FAILED', {
            errors: [{ field: 'parentId', code: 'INVALID' }],
          });
        }
        if (dto.anchor || dto.reviewStepId) {
          throw new Problem('VALIDATION_FAILED', {
            errors: [
              { field: dto.anchor ? 'anchor' : 'reviewStepId', code: 'NOT_ALLOWED_ON_REPLY' },
            ],
          });
        }
      } else if (dto.reviewStepId) {
        // BR-DOC-035: review comments only from the assignee while the step is ACTIVE
        const step = await tx.reviewStep.findUnique({
          where: { id: dto.reviewStepId },
          include: { cycle: { select: { revisionId: true, status: true } } },
        });
        if (!step || step.cycle.revisionId !== dto.ownerId) {
          throw new Problem('VALIDATION_FAILED', {
            errors: [{ field: 'reviewStepId', code: 'INVALID' }],
          });
        }
        if (step.assigneeId !== user.id)
          throw new Problem('DOC_NOT_ASSIGNEE', { rule: 'BR-DOC-035' });
        if (step.status !== 'ACTIVE' || step.cycle.status !== 'IN_PROGRESS') {
          throw new Problem('DOC_STEP_NOT_ACTIVE', { rule: 'BR-DOC-035' });
        }
        status = 'OPEN';
        reviewStepId = step.id;
      }
      this.assertAnchor(dto.anchor);
      const mentions = await this.mentions(tx, user, dto.mentions);
      const id = this.ids.next();
      await tx.comment.create({
        data: {
          id,
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
          parentId: dto.parentId ?? null,
          authorId: user.id,
          body: dto.body,
          mentions,
          anchor: dto.anchor ? { ...dto.anchor } : undefined,
          status,
          reviewStepId,
          createdAt: this.clock.now(),
        },
      });
      await this.audit.record(tx, {
        action: 'comment.create',
        entityType: 'Comment',
        entityId: id,
        projectId: owner.projectId,
        summary: `${owner.rev.doc.number} Rev.${owner.rev.rev.revLabel}: ${excerpt(dto.body)}`,
      });
      await this.after(tx, owner, id, 'comment.created', {
        mentions,
        excerpt: excerpt(dto.body),
      });
      return id;
    });
    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateCommentDto): Promise<CommentDto> {
    await this.prisma.$transaction(async (tx) => {
      const { c, owner } = await this.load(user, id, tx);
      this.assertAuthorEditable(user, c, owner);
      if (dto.anchor !== undefined && c.parentId) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'anchor', code: 'NOT_ALLOWED_ON_REPLY' }],
        });
      }
      if (dto.anchor) this.assertAnchor(dto.anchor);
      const mentions = dto.mentions ? await this.mentions(tx, user, dto.mentions) : undefined;
      const res = await tx.comment.updateMany({
        where: { id, version: dto.version, ...notDeleted },
        data: {
          body: dto.body,
          anchor: dto.anchor === null ? Prisma.DbNull : dto.anchor ? { ...dto.anchor } : undefined,
          mentions,
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(
        res,
        async () => !!(await tx.comment.findUnique({ where: { id } })),
      );
      await this.audit.record(tx, {
        action: 'comment.update',
        entityType: 'Comment',
        entityId: id,
        projectId: owner.projectId,
        changes:
          dto.body !== undefined
            ? { before: { body: c.body }, after: { body: dto.body } }
            : undefined,
      });
      const added = (mentions ?? []).filter((m) => !c.mentions.includes(m));
      await this.after(tx, owner, id, added.length ? 'comment.created' : 'comment.changed', {
        mentions: added,
        excerpt: excerpt(dto.body ?? c.body),
      });
    });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string, version: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { c, owner } = await this.load(user, id, tx);
      this.assertAuthorEditable(user, c, owner);
      const res = await tx.comment.updateMany({
        where: { id, version, ...notDeleted },
        data: { deletedAt: this.clock.now(), ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        async () => !!(await tx.comment.findUnique({ where: { id } })),
      );
      await this.audit.record(tx, {
        action: 'comment.delete',
        entityType: 'Comment',
        entityId: id,
        projectId: owner.projectId,
        summary: excerpt(c.body),
      });
      await this.after(tx, owner, id, 'comment.changed', {});
    });
  }

  /** OPEN → RESPONDED by the preparer (docs/05-workflows.md §3). */
  async respond(user: AuthUser, id: string, dto: RespondCommentDto): Promise<CommentDto> {
    await this.prisma.$transaction(async (tx) => {
      const { c, owner } = await this.load(user, id, tx);
      if (!owner.open) throw new Problem('DOC_COMMENT_NOT_EDITABLE');
      if (!owner.canAnswer) throw new Problem('FORBIDDEN');
      const to = assertCommentTransition(c.status, 'respond');
      await this.transition(tx, c, dto.version, { status: to, responseNote: dto.responseNote });
      await this.audit.record(tx, {
        action: 'comment.respond',
        entityType: 'Comment',
        entityId: id,
        projectId: owner.projectId,
        summary: excerpt(dto.responseNote),
      });
      await this.after(tx, owner, id, 'comment.responded', {
        authorId: c.authorId,
        excerpt: excerpt(dto.responseNote),
      });
    });
    return this.get(user, id);
  }

  /** OPEN/RESPONDED → CLOSED by the comment author or document.admin. */
  async close(user: AuthUser, id: string, dto: CommentStateDto): Promise<CommentDto> {
    return this.authorTransition(user, id, dto, 'close');
  }

  /** RESPONDED → OPEN: the reviewer does not accept the answer. */
  async reopen(user: AuthUser, id: string, dto: CommentStateDto): Promise<CommentDto> {
    return this.authorTransition(user, id, dto, 'reopen');
  }

  private async authorTransition(
    user: AuthUser,
    id: string,
    dto: CommentStateDto,
    action: 'close' | 'reopen',
  ): Promise<CommentDto> {
    await this.prisma.$transaction(async (tx) => {
      const { c, owner } = await this.load(user, id, tx);
      if (!owner.open) throw new Problem('DOC_COMMENT_NOT_EDITABLE');
      if (c.authorId !== user.id && !user.permissions.has('document.admin')) {
        throw new Problem('FORBIDDEN');
      }
      const to = assertCommentTransition(c.status, action);
      const now = this.clock.now();
      await this.transition(
        tx,
        c,
        dto.version,
        action === 'close'
          ? { status: to, resolvedById: user.id, resolvedAt: now }
          : { status: to, resolvedById: null, resolvedAt: null },
      );
      if (dto.note) {
        await tx.comment.create({
          data: {
            id: this.ids.next(),
            ownerType: c.ownerType,
            ownerId: c.ownerId,
            parentId: c.id,
            authorId: user.id,
            body: dto.note,
            createdAt: now,
          },
        });
      }
      await this.audit.record(tx, {
        action: `comment.${action}`,
        entityType: 'Comment',
        entityId: id,
        projectId: owner.projectId,
        summary: dto.note ? excerpt(dto.note) : undefined,
      });
      await this.after(tx, owner, id, 'comment.changed', {});
    });
    return this.get(user, id);
  }

  private async transition(
    tx: Tx,
    c: Comment,
    version: number,
    data: Prisma.CommentUncheckedUpdateManyInput,
  ): Promise<void> {
    const res = await tx.comment.updateMany({
      where: { id: c.id, version, ...notDeleted },
      data: { ...data, ...bumpVersion },
    });
    await assertVersionedUpdate(res, () => Promise.resolve(true));
  }

  private assertAuthorEditable(user: AuthUser, c: CommentRow, owner: OwnerCtx): void {
    if (c.authorId !== user.id) throw new Problem('FORBIDDEN');
    if (!owner.open) throw new Problem('DOC_COMMENT_NOT_EDITABLE');
    if (
      !c.parentId &&
      !isEditable({ status: c.status, stepStatus: c.reviewStep?.status ?? null })
    ) {
      throw new Problem('DOC_COMMENT_NOT_EDITABLE');
    }
  }

  private assertAnchor(a: PdfAnchorDto | undefined | null): void {
    if (a && !validAnchor(a)) {
      throw new Problem('VALIDATION_FAILED', { errors: [{ field: 'anchor', code: 'INVALID' }] });
    }
  }

  /** Active users only, without the author (BR-PLT-030: no notification for own actions). */
  private async mentions(tx: Tx, user: AuthUser, ids: string[] | undefined): Promise<string[]> {
    const wanted = [...new Set(ids ?? [])].filter((x) => x !== user.id);
    if (!wanted.length) return [];
    const found = await tx.user.findMany({
      where: { id: { in: wanted }, isActive: true, ...notDeleted },
      select: { id: true },
    });
    if (found.length !== wanted.length) {
      throw new Problem('VALIDATION_FAILED', { errors: [{ field: 'mentions', code: 'INVALID' }] });
    }
    return wanted;
  }

  private async after(
    tx: Tx,
    owner: OwnerCtx,
    commentId: string,
    event: 'comment.created' | 'comment.responded' | 'comment.changed',
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.changes.touch(tx, Scope.project(owner.projectId), 'Comment', commentId);
    const base = {
      commentId,
      revisionId: owner.rev.rev.id,
      documentId: owner.rev.doc.id,
      projectId: owner.projectId,
    };
    await this.outbox.publish(tx, event, { ...base, ...extra }, commentId);
  }

  // ───────────────────────── CRS ─────────────────────────

  /** Comment resolution sheet of a revision (M04 §6). Review comments only — general notes are not part of it. */
  async crs(user: AuthUser, revisionId: string, format: 'pdf' | 'xlsx'): Promise<XlsxFile> {
    const owner = await this.owner(user, 'DOCUMENT_REVISION', revisionId);
    const l: Locale = user.locale === 'en' ? 'en' : 'th';
    const H = (th: string, en: string) => (l === 'en' ? en : th);
    const comments = (await this.listForOwner(user, owner, 'DOCUMENT_REVISION', revisionId)).filter(
      (c) => c.status !== 'NONE',
    );
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: owner.projectId },
      select: { code: true, name: true },
    });
    const lastCycle = await this.prisma.reviewCycle.findFirst({
      where: { revisionId },
      orderBy: { cycleNo: 'desc' },
      select: { cycleNo: true },
    });
    const date = (iso: string | null) => (iso ? this.formatDate(new Date(iso), l) : '');
    const rows = comments.map((c) => ({
      seq: `#${c.seq}`,
      page: c.anchor ? String(c.anchor.page) : '',
      author: c.author.displayName,
      step: c.stepName
        ? `${c.stepName}${c.cycleNo ? ` (${H('รอบ', 'cycle')} ${c.cycleNo})` : ''}`
        : '',
      date: date(c.createdAt),
      body: c.body,
      response: c.responseNote ?? '',
      status: enumLabel('CommentStatus', c.status, l),
      closed: c.resolvedBy ? `${c.resolvedBy.displayName} ${date(c.resolvedAt)}` : '',
      carried: c.carriedFromRevLabel ? `Rev.${c.carriedFromRevLabel}` : '',
    }));
    const doc = owner.rev.doc;
    const rev = owner.rev.rev;
    const base = `CRS-${doc.number}-Rev${rev.revLabel}`;
    const printed = this.formatDate(this.clock.now(), l);
    const headers = [
      H('ลำดับ', 'No.'),
      H('หน้า', 'Page'),
      H('ผู้ให้ความเห็น', 'Reviewer'),
      H('ขั้นตอน', 'Step'),
      H('วันที่', 'Date'),
      H('ความเห็น', 'Comment'),
      H('คำตอบของผู้จัดทำ', 'Response'),
      H('สถานะ', 'Status'),
      H('ผู้ปิด/วันที่ปิด', 'Closed by/date'),
      H('ยกมาจาก', 'Carried from'),
    ];
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'WEMS';
      const ws = wb.addWorksheet('CRS');
      ws.addRow([H('ตารางสรุปความเห็น (CRS)', 'Comment resolution sheet (CRS)')]).font = {
        bold: true,
        size: 14,
      };
      ws.addRow([`${H('โครงการ', 'Project')}: ${project.code} ${project.name}`]);
      ws.addRow([`${H('เอกสาร', 'Document')}: ${doc.number} ${doc.title}`]);
      ws.addRow([
        `Rev.${rev.revLabel} · ${H('รอบที่', 'Cycle')} ${lastCycle?.cycleNo ?? '-'} · ${H('พิมพ์เมื่อ', 'Printed')} ${printed}`,
      ]);
      ws.addRow([]);
      const head = ws.addRow(headers);
      head.font = { bold: true };
      for (const r of rows) {
        ws.addRow([
          r.seq,
          r.page,
          r.author,
          r.step,
          r.date,
          r.body,
          r.response,
          r.status,
          r.closed,
          r.carried,
        ]);
      }
      [7, 6, 22, 22, 12, 50, 50, 14, 24, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      ws.getColumn(6).alignment = { wrapText: true, vertical: 'top' };
      ws.getColumn(7).alignment = { wrapText: true, vertical: 'top' };
      return {
        name: `${base}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.from(await wb.xlsx.writeBuffer()),
      };
    }
    const body = await this.pdf.render(
      'crs',
      {
        title: H('ตารางสรุปความเห็น (CRS)', 'Comment resolution sheet (CRS)'),
        labels: {
          project: H('โครงการ', 'Project'),
          document: H('เอกสาร', 'Document'),
          revision: H('ฉบับแก้ไข', 'Revision'),
          cycle: H('รอบที่', 'Cycle'),
          printed: H('พิมพ์เมื่อ', 'Printed'),
          empty: H('ไม่มีความเห็นจากการตรวจ', 'No review comments'),
        },
        project: `${project.code} ${project.name}`,
        document: `${doc.number} ${doc.title}`,
        revision: `Rev.${rev.revLabel} (${enumLabel('PurposeCode', rev.purposeCode, l)})`,
        cycle: lastCycle?.cycleNo ?? '-',
        printed,
        headers,
        rows,
      },
      { locale: l, landscape: true, footerLeft: `${doc.number} Rev.${rev.revLabel} CRS` },
    );
    return { name: `${base}.pdf`, mimeType: 'application/pdf', body };
  }

  private formatDate(d: Date, l: Locale): string {
    const [y, m, day] = bangkokDate(d).split('-');
    return `${day}/${m}/${l === 'en' ? y : buddhistYear(Number(y))}`;
  }
}
