import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type {
  ClientReturnCode,
  DocumentStatus,
  PurposeCode,
  RevisionStatus,
} from '../../generated/prisma/enums';
import { AuditService, diffFields } from '../../common/audit/audit.service';
import { ChangeLogService, Scope } from '../../common/audit/change-log.service';
import type { AuthUser } from '../../common/auth/auth-user';
import type { ProjectAccess } from '../../common/auth/project-access.service';
import { Problem } from '../../common/errors/problem';
import { csv, pageArgs, parseSort, type Page } from '../../common/http/pagination';
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
import { ClockService } from '../../common/time/clock';
import { documentsEditable } from '../projects/domain/project-state-machine';
import { DocumentAccessService } from './document-access.service';
import { isInProgress } from './domain/revision-state-machine';
import type {
  CreateDocumentDto,
  DocumentActionDto,
  DocumentDto,
  DocumentListItemDto,
  ListDocumentsQueryDto,
  PlanDto,
  PlanInputDto,
  RevisionSummaryDto,
  SaveDocumentResultDto,
  SupersedeDocumentDto,
  UpdateDocumentDto,
} from './dto/documents.dto';
import { RevisionsService } from './revisions.service';

const revisionSelect = {
  id: true,
  revLabel: true,
  revIndex: true,
  purposeCode: true,
  status: true,
  clientReturnCode: true,
  approvedAt: true,
  issuedAt: true,
} as const;

const listInclude = {
  discipline: true,
  documentType: true,
  owner: { select: { id: true, displayNameTh: true } },
  currentRevision: { select: revisionSelect },
  latestApprovedRevision: { select: revisionSelect },
  plans: true,
} satisfies Prisma.DocumentInclude;

type ListRow = Prisma.DocumentGetPayload<{ include: typeof listInclude }>;
type RevRow = Prisma.DocumentRevisionGetPayload<{ select: typeof revisionSelect }>;

const OPEN_COMMENT = ['OPEN', 'RESPONDED'] as const;
const NEEDS_REVISION_CODES: ClientReturnCode[] = ['CODE_3', 'CODE_4'];

type DocAction = 'hold' | 'resume' | 'cancel' | 'supersede';
const DOC_TRANSITIONS: Record<DocAction, { from: DocumentStatus[]; to: DocumentStatus }> = {
  hold: { from: ['ACTIVE'], to: 'ON_HOLD' },
  resume: { from: ['ON_HOLD'], to: 'ACTIVE' },
  cancel: { from: ['ACTIVE', 'ON_HOLD'], to: 'CANCELLED' },
  supersede: { from: ['ACTIVE', 'ON_HOLD'], to: 'SUPERSEDED' },
};

/** M04 document register (BR-DOC-010..016, M04 §3.1, §9, §10). */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly changes: ChangeLogService,
    private readonly outbox: OutboxService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
    private readonly numbering: NumberingService,
    private readonly docAccess: DocumentAccessService,
    private readonly revisions: RevisionsService,
  ) {}

  // ───────────────────────── list ─────────────────────────

  /** Shared filter of the register, the Excel export and the MDL report. */
  async listWhere(projectId: string, q: ListDocumentsQueryDto): Promise<Prisma.DocumentWhereInput> {
    const statuses = (csv(q.status) ?? ['ACTIVE', 'ON_HOLD']) as DocumentStatus[];
    const revStatuses = csv(q.revisionStatus);
    const purposes = csv(q.purposeCode) as PurposeCode[] | undefined;
    const codes = csv(q.clientReturnCode) as ClientReturnCode[] | undefined;
    const and: Prisma.DocumentWhereInput[] = [];
    if (revStatuses?.length) {
      const real = revStatuses.filter((s) => s !== 'NONE') as RevisionStatus[];
      and.push({
        OR: [
          ...(real.length ? [{ currentRevision: { status: { in: real } } }] : []),
          ...(revStatuses.includes('NONE') ? [{ currentRevisionId: null }] : []),
        ],
      });
    }
    if (q.hasOpenComments !== undefined) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT d.id FROM documents d
        JOIN comments c ON c.owner_type = 'DOCUMENT_REVISION' AND c.owner_id = d.current_revision_id
        WHERE d.project_id = ${projectId}::uuid AND c.deleted_at IS NULL AND c.status IN ('OPEN','RESPONDED')`;
      const ids = rows.map((r) => r.id);
      and.push(q.hasOpenComments ? { id: { in: ids } } : { id: { notIn: ids } });
    }
    if (q.q) {
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { title: { contains: q.q, mode: 'insensitive' } },
          { titleEn: { contains: q.q, mode: 'insensitive' } },
          { externalNumber: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    return {
      projectId,
      ...notDeleted,
      status: { in: statuses },
      ...(q.disciplineId ? { disciplineId: q.disciplineId } : {}),
      ...(q.documentTypeId ? { documentTypeId: q.documentTypeId } : {}),
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(purposes?.length ? { currentRevision: { purposeCode: { in: purposes } } } : {}),
      ...(codes?.length ? { latestApprovedRevision: { clientReturnCode: { in: codes } } } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  async list(
    projectId: string,
    q: ListDocumentsQueryDto,
    user: AuthUser,
  ): Promise<Page<DocumentListItemDto>> {
    await this.docAccess.project(user, projectId);
    const { skip, take, page, pageSize } = pageArgs(q);
    const sort = parseSort(q.sort, ['number', 'title', 'updatedAt'] as const, [
      { field: 'number', dir: 'asc' },
    ]);
    const where = await this.listWhere(projectId, q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: listInclude,
        orderBy: sort.map((s) => ({ [s.field]: s.dir })),
        skip,
        take,
      }),
      this.prisma.document.count({ where }),
    ]);
    const counts = await this.openCommentCounts(rows.map((r) => r.currentRevisionId));
    return {
      data: rows.map((r) => this.toListItem(r, counts)),
      meta: { page, pageSize, total },
    };
  }

  async openCommentCounts(revisionIds: (string | null)[]): Promise<Map<string, number>> {
    const ids = revisionIds.filter((x): x is string => !!x);
    if (!ids.length) return new Map();
    const rows = await this.prisma.comment.groupBy({
      by: ['ownerId'],
      where: {
        ownerType: 'DOCUMENT_REVISION',
        ownerId: { in: ids },
        status: { in: [...OPEN_COMMENT] },
        parentId: null,
        ...notDeleted,
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.ownerId, r._count._all]));
  }

  toListItem(d: ListRow, counts: Map<string, number>): DocumentListItemDto {
    const cur = d.currentRevision;
    return {
      id: d.id,
      projectId: d.projectId,
      number: d.number,
      title: d.title,
      titleEn: d.titleEn,
      discipline: pickRef(d.discipline),
      documentType: pickRef(d.documentType),
      status: d.status,
      confidentiality: d.confidentiality,
      owner: d.owner ? { id: d.owner.id, displayName: d.owner.displayNameTh } : null,
      currentRevision: cur ? toRevSummary(cur) : null,
      latestApprovedRevision: d.latestApprovedRevision
        ? toRevSummary(d.latestApprovedRevision)
        : null,
      needsNewRevision:
        !!cur &&
        (cur.status === 'APPROVED' || cur.status === 'ISSUED') &&
        !!cur.clientReturnCode &&
        NEEDS_REVISION_CODES.includes(cur.clientReturnCode),
      openCommentCount: (cur && counts.get(cur.id)) ?? 0,
      plans: sortPlans(d.plans).map(toPlanDto),
      tags: d.tags,
      updatedAt: d.updatedAt.toISOString(),
      version: d.version,
    };
  }

  // ───────────────────────── detail ─────────────────────────

  async get(id: string, user: AuthUser): Promise<DocumentDto> {
    const { access } = await this.docAccess.document(user, id);
    const d = await this.prisma.document.findUniqueOrThrow({
      where: { id },
      include: {
        ...listInclude,
        revisions: { select: revisionSelect, orderBy: { revIndex: 'desc' } },
      },
    });
    const counts = await this.openCommentCounts([d.currentRevisionId]);
    const base = this.toListItem(d, counts);
    const { allowed, blocked } = this.actions(user, access, d, d.revisions);
    return {
      ...base,
      source: d.source,
      originator: d.originator,
      externalNumber: d.externalNumber,
      sheetSize: d.sheetSize,
      scale: d.scale,
      remarks: d.remarks,
      workflowTemplateId: d.workflowTemplateId,
      supersededByDocumentId: d.supersededByDocumentId,
      revisions: d.revisions.map(toRevSummary),
      createdAt: d.createdAt.toISOString(),
      allowedActions: allowed,
      blockedActions: blocked,
    };
  }

  /** allowedActions / blockedActions of a document (docs/04-api-conventions.md §7). */
  private actions(
    user: AuthUser,
    access: ProjectAccess,
    d: { status: DocumentStatus; currentRevisionId: string | null },
    revisions: RevRow[],
  ): { allowed: string[]; blocked: { action: string; code: string }[] } {
    const allowed: string[] = [];
    const blocked: { action: string; code: string }[] = [];
    if (!user.permissions.has('document.edit')) return { allowed, blocked };
    const editable = documentsEditable(access.project.status);
    const open = d.status === 'ACTIVE' || d.status === 'ON_HOLD';
    if (editable && open) allowed.push('edit', 'editPlans');
    if (editable) {
      for (const [a, t] of Object.entries(DOC_TRANSITIONS))
        if (t.from.includes(d.status)) allowed.push(a);
    }
    const current = revisions.find((r) => r.id === d.currentRevisionId);
    if (!editable) blocked.push({ action: 'newRevision', code: 'DOC_PROJECT_NOT_EDITABLE' });
    else if (d.status !== 'ACTIVE') blocked.push({ action: 'newRevision', code: 'DOC_NOT_ACTIVE' });
    else if (current && isInProgress(current.status))
      blocked.push({ action: 'newRevision', code: 'DOC_REVISION_IN_PROGRESS' });
    else allowed.push('newRevision');
    return { allowed, blocked };
  }

  // ───────────────────────── create ─────────────────────────

  private async masterData(tx: Tx, disciplineId: string, documentTypeId: string) {
    const [discipline, type] = await Promise.all([
      tx.discipline.findUnique({ where: { id: disciplineId } }),
      tx.documentType.findUnique({ where: { id: documentTypeId } }),
    ]);
    const errors: { field: string; code: string }[] = [];
    if (!discipline?.isActive) errors.push({ field: 'disciplineId', code: 'NOT_FOUND' });
    if (!type?.isActive) errors.push({ field: 'documentTypeId', code: 'NOT_FOUND' });
    if (errors.length) throw new Problem('VALIDATION_FAILED', { errors });
    return { discipline: discipline!, type: type! };
  }

  private async assertOwner(tx: Tx, projectId: string, ownerId: string | null | undefined) {
    if (!ownerId) return;
    const m = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ownerId } },
      include: { user: { select: { isActive: true } } },
    });
    if (!m || m.removedAt || !m.user.isActive) {
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'ownerId', code: 'NOT_MEMBER' }],
      });
    }
  }

  private async assertTemplate(tx: Tx, id: string | null | undefined) {
    if (!id) return;
    const t = await tx.workflowTemplate.findUnique({ where: { id } });
    if (!t?.isActive) {
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'workflowTemplateId', code: 'NOT_FOUND' }],
      });
    }
  }

  /** BR-DOC-010: next number of (project, discipline, type); numbers are never reused. */
  async issueNumber(
    tx: Tx,
    projectId: string,
    disciplineCode: string,
    typeCode: string,
  ): Promise<string> {
    const p = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { client: { select: { code: true } } },
    });
    return this.numbering.next(
      tx,
      'DOCUMENT',
      { project: p.code, client: p.client.code, discipline: disciplineCode, type: typeCode },
      {
        projectId,
        exists: async (n) =>
          !!(await tx.document.findUnique({ where: { number: n }, select: { id: true } })),
      },
    );
  }

  /** BR-DOC-013: same title in the same discipline and type → warning. */
  private async titleWarnings(
    tx: Tx,
    projectId: string,
    disciplineId: string,
    documentTypeId: string,
    title: string,
    exceptId?: string,
  ): Promise<SaveDocumentResultDto['warnings']> {
    const dupes = await tx.document.findMany({
      where: {
        projectId,
        disciplineId,
        documentTypeId,
        title: { equals: title, mode: 'insensitive' },
        ...notDeleted,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { number: true },
      take: 10,
    });
    return dupes.length
      ? [{ code: 'DOC_TITLE_EXISTS', documents: dupes.map((d) => d.number) }]
      : [];
  }

  async savePlans(tx: Tx, documentId: string, plans: PlanInputDto[]): Promise<void> {
    const seen = new Set<string>();
    for (const p of plans) {
      if (seen.has(p.purposeCode)) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'plans', code: 'DUPLICATE_PURPOSE' }],
        });
      }
      seen.add(p.purposeCode);
    }
    await tx.documentPlan.deleteMany({
      where: { documentId, purposeCode: { notIn: plans.map((p) => p.purposeCode) } },
    });
    for (const p of plans) {
      const data = {
        plannedDate: fromDateOnly(p.plannedDate),
        forecastDate: fromDateOnly(p.forecastDate),
        ...(p.actualDate !== undefined ? { actualDate: fromDateOnly(p.actualDate) } : {}),
      };
      await tx.documentPlan.upsert({
        where: { documentId_purposeCode: { documentId, purposeCode: p.purposeCode } },
        update: data,
        create: { id: this.ids.next(), documentId, purposeCode: p.purposeCode, ...data },
      });
    }
  }

  /** Creates one document inside the caller's transaction (also used by the Excel import). */
  async createInTx(
    tx: Tx,
    projectId: string,
    dto: CreateDocumentDto,
    user: AuthUser,
    opts: { number?: string } = {},
  ): Promise<{ id: string; number: string }> {
    const { discipline, type } = await this.masterData(tx, dto.disciplineId, dto.documentTypeId);
    await this.assertOwner(tx, projectId, dto.ownerId);
    await this.assertTemplate(tx, dto.workflowTemplateId);
    const number =
      opts.number ?? (await this.issueNumber(tx, projectId, discipline.code, type.code));
    const id = this.ids.next();
    const { plans, firstRevision: _r, ...fields } = dto;
    await tx.document.create({
      data: {
        ...fields,
        id,
        projectId,
        number,
        tags: dto.tags ?? [],
        createdById: user.id,
      },
    });
    if (plans?.length) await this.savePlans(tx, id, plans);
    await this.audit.record(tx, {
      action: 'document.create',
      entityType: 'Document',
      entityId: id,
      projectId,
      summary: `${number} ${dto.title}`,
    });
    await this.changes.touch(tx, Scope.project(projectId), 'Document', id);
    await this.outbox.publish(tx, 'document.created', { documentId: id, projectId }, id);
    return { id, number };
  }

  async create(
    projectId: string,
    dto: CreateDocumentDto,
    user: AuthUser,
  ): Promise<SaveDocumentResultDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const access = await this.docAccess.project(user, projectId, tx);
      this.docAccess.require(user, 'document.create');
      this.docAccess.assertProjectEditable(access);
      const created = await this.createInTx(tx, projectId, dto, user);
      if (dto.firstRevision) {
        if (!user.permissions.has('document.edit')) throw new Problem('FORBIDDEN');
        await this.revisions.createInTx(tx, user, created.id, dto.firstRevision);
      }
      return created.id;
    });
    const warnings = await this.titleWarnings(
      this.prisma,
      projectId,
      dto.disciplineId,
      dto.documentTypeId,
      dto.title,
      id,
    );
    return { ...(await this.get(id, user)), warnings };
  }

  // ───────────────────────── update ─────────────────────────

  async update(id: string, dto: UpdateDocumentDto, user: AuthUser): Promise<SaveDocumentResultDto> {
    await this.prisma.$transaction(async (tx) => {
      const { doc, access } = await this.docAccess.document(user, id, tx);
      this.docAccess.require(user, 'document.edit');
      this.docAccess.assertProjectEditable(access);
      if (doc.status === 'CANCELLED' || doc.status === 'SUPERSEDED') {
        throw new Problem('DOC_NOT_ACTIVE');
      }
      const disciplineChanged =
        dto.disciplineId !== undefined && dto.disciplineId !== doc.disciplineId;
      const typeChanged =
        dto.documentTypeId !== undefined && dto.documentTypeId !== doc.documentTypeId;
      const numberChanged = dto.number !== undefined && dto.number !== doc.number;
      let number: string | undefined;
      if (disciplineChanged || typeChanged || numberChanged) {
        // BR-DOC-011: free before any approval (new number); afterwards document.admin + reason
        const approved = await tx.documentRevision.count({
          where: { documentId: id, approvedAt: { not: null } },
        });
        const isAdmin = user.permissions.has('document.admin');
        if ((approved || numberChanged) && !isAdmin) {
          throw new Problem('DOC_NUMBER_LOCKED', { rule: 'BR-DOC-011' });
        }
        if (approved && (!dto.reason || dto.reason.length < 3)) {
          throw new Problem('VALIDATION_FAILED', {
            rule: 'BR-DOC-011',
            errors: [{ field: 'reason', code: 'REQUIRED' }],
          });
        }
        const { discipline, type } = await this.masterData(
          tx,
          dto.disciplineId ?? doc.disciplineId,
          dto.documentTypeId ?? doc.documentTypeId,
        );
        if (numberChanged) {
          if (
            await tx.document.findUnique({ where: { number: dto.number }, select: { id: true } })
          ) {
            throw new Problem('DUPLICATE', { errors: [{ field: 'number', code: 'DUPLICATE' }] });
          }
          number = dto.number;
        } else {
          number = await this.issueNumber(tx, doc.projectId, discipline.code, type.code);
        }
      }
      if (dto.ownerId !== undefined) await this.assertOwner(tx, doc.projectId, dto.ownerId);
      if (dto.workflowTemplateId !== undefined)
        await this.assertTemplate(tx, dto.workflowTemplateId);
      const { version, reason, number: _n, ...fields } = dto;
      const data = { ...fields, ...(number ? { number } : {}) };
      const res = await tx.document.updateMany({
        where: { id, version, ...notDeleted },
        data: { ...data, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.get(id, user),
      );
      await this.audit.record(tx, {
        action: number ? 'document.renumber' : 'document.update',
        entityType: 'Document',
        entityId: id,
        projectId: doc.projectId,
        summary: number ? `${doc.number} → ${number}` : undefined,
        changes: diffFields(doc, data),
        reason: reason ?? null,
      });
      await this.changes.touch(tx, Scope.project(doc.projectId), 'Document', id);
      await this.outbox.publish(
        tx,
        'document.updated',
        { documentId: id, projectId: doc.projectId },
        id,
      );
    });
    const d = await this.get(id, user);
    const warnings =
      dto.title !== undefined
        ? await this.titleWarnings(
            this.prisma,
            d.projectId,
            d.discipline.id,
            d.documentType.id,
            d.title,
            id,
          )
        : [];
    return { ...d, warnings };
  }

  async putPlans(id: string, plans: PlanInputDto[], user: AuthUser): Promise<DocumentDto> {
    await this.prisma.$transaction(async (tx) => {
      const { doc, access } = await this.docAccess.document(user, id, tx);
      this.docAccess.require(user, 'document.edit');
      this.docAccess.assertProjectEditable(access);
      const before = await tx.documentPlan.findMany({ where: { documentId: id } });
      await this.savePlans(tx, id, plans);
      await tx.document.update({ where: { id }, data: bumpVersion });
      await this.audit.record(tx, {
        action: 'document.plans.update',
        entityType: 'Document',
        entityId: id,
        projectId: doc.projectId,
        changes: {
          before: { plans: before.map(toPlanDto) },
          after: { plans },
        },
      });
      await this.changes.touch(tx, Scope.project(doc.projectId), 'Document', id);
    });
    return this.get(id, user);
  }

  async act(
    id: string,
    action: DocAction,
    dto: DocumentActionDto | SupersedeDocumentDto,
    user: AuthUser,
  ): Promise<DocumentDto> {
    await this.prisma.$transaction(async (tx) => {
      const { doc, access } = await this.docAccess.document(user, id, tx);
      this.docAccess.require(user, 'document.edit');
      this.docAccess.assertProjectEditable(access);
      const t = DOC_TRANSITIONS[action];
      if (!t.from.includes(doc.status)) {
        throw new Problem('INVALID_STATE_TRANSITION', { extra: { status: doc.status, action } });
      }
      if (action === 'cancel' && (!dto.reason || dto.reason.length < 3)) {
        throw new Problem('VALIDATION_FAILED', { errors: [{ field: 'reason', code: 'REQUIRED' }] });
      }
      let supersededBy: string | undefined;
      if (action === 'supersede') {
        const by = (dto as SupersedeDocumentDto).byDocumentId;
        const other = await tx.document.findFirst({
          where: { id: by, projectId: doc.projectId, ...notDeleted, status: 'ACTIVE' },
        });
        if (!other || other.id === id) {
          throw new Problem('VALIDATION_FAILED', {
            errors: [{ field: 'byDocumentId', code: 'NOT_FOUND' }],
          });
        }
        supersededBy = other.id;
      }
      if (action === 'cancel' || action === 'supersede') {
        const current = doc.currentRevisionId
          ? await tx.documentRevision.findUnique({ where: { id: doc.currentRevisionId } })
          : null;
        if (current?.status === 'IN_REVIEW') {
          throw new Problem('DOC_REVISION_IN_PROGRESS', { rule: 'BR-DOC-021' });
        }
      }
      const res = await tx.document.updateMany({
        where: { id, version: dto.version, status: doc.status, ...notDeleted },
        data: {
          status: t.to,
          ...(supersededBy ? { supersededByDocumentId: supersededBy } : {}),
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.get(id, user),
      );
      await this.audit.record(tx, {
        action: `document.${action}`,
        entityType: 'Document',
        entityId: id,
        projectId: doc.projectId,
        changes: { before: { status: doc.status }, after: { status: t.to, supersededBy } },
        reason: dto.reason ?? null,
      });
      await this.changes.touch(tx, Scope.project(doc.projectId), 'Document', id);
      await this.outbox.publish(
        tx,
        'document.updated',
        { documentId: id, projectId: doc.projectId },
        id,
      );
    });
    return this.get(id, user);
  }

  /** Number the next document would get (register dialog preview). */
  async previewNumber(
    projectId: string,
    disciplineId: string,
    documentTypeId: string,
    user: AuthUser,
  ): Promise<string> {
    const access = await this.docAccess.project(user, projectId);
    const { discipline, type } = await this.masterData(this.prisma, disciplineId, documentTypeId);
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: access.project.clientId },
      select: { code: true },
    });
    return this.numbering.preview(
      'DOCUMENT',
      {
        project: access.project.code,
        client: client.code,
        discipline: discipline.code,
        type: type.code,
      },
      { projectId },
    );
  }

  nowIso(): string {
    return this.clock.now().toISOString();
  }
}

function pickRef(x: { id: string; code: string; nameTh: string; nameEn: string }) {
  return { id: x.id, code: x.code, nameTh: x.nameTh, nameEn: x.nameEn };
}

export function toRevSummary(r: RevRow): RevisionSummaryDto {
  return {
    id: r.id,
    revLabel: r.revLabel,
    revIndex: r.revIndex,
    purposeCode: r.purposeCode,
    status: r.status,
    clientReturnCode: r.clientReturnCode,
    approvedAt: iso(r.approvedAt),
    issuedAt: iso(r.issuedAt),
  };
}

const PURPOSE_ORDER: PurposeCode[] = ['FI', 'FR', 'FA', 'FT', 'FC', 'AB'];
function sortPlans<T extends { purposeCode: PurposeCode }>(plans: T[]): T[] {
  return [...plans].sort(
    (a, b) => PURPOSE_ORDER.indexOf(a.purposeCode) - PURPOSE_ORDER.indexOf(b.purposeCode),
  );
}

export function toPlanDto(p: {
  purposeCode: PurposeCode;
  plannedDate: Date | null;
  forecastDate: Date | null;
  actualDate: Date | null;
}): PlanDto {
  return {
    purposeCode: p.purposeCode,
    plannedDate: toDateOnly(p.plannedDate),
    forecastDate: toDateOnly(p.forecastDate),
    actualDate: toDateOnly(p.actualDate),
  };
}
