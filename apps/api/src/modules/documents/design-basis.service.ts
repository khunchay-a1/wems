import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { ChangeLogService, Scope } from '../../common/audit/change-log.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { ProjectAccessService, type ProjectAccess } from '../../common/auth/project-access.service';
import { canonicalJson, sha256Hex } from '../../common/crypto/crypto';
import { Problem } from '../../common/errors/problem';
import { IdGenerator } from '../../common/ids/id-generator';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  assertVersionedUpdate,
  bumpVersion,
  decimalToString,
  iso,
  type Tx,
} from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClockService } from '../../common/time/clock';
import { SignatureService } from '../platform/auth/signature.service';
import { documentsEditable } from '../projects/domain/project-state-machine';
import {
  assertDesignBasisTransition,
  assertDraft,
  assertNotSelfApproval,
  sourceErrors,
} from './domain/design-basis';
import type {
  ApproveDesignBasisDto,
  CreateDesignBasisDto,
  DesignBasisDto,
  DesignBasisItemInputDto,
  DesignBasisSummaryDto,
  ParameterRefDto,
  StandardRefDto,
  UpdateDesignBasisDto,
} from './dto/design-basis.dto';

const include = {
  items: {
    include: { parameter: { select: { code: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
  approvedBy: { select: { id: true, displayNameTh: true } },
  targetStandard: { include: { limits: true } },
} satisfies Prisma.DesignBasisInclude;
type Row = Prisma.DesignBasisGetPayload<{ include: typeof include }>;

const dec = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Prisma.Decimal(v.trim());

/** Project design basis (M04 §3.7, BR-DOC-080..083; docs/05-workflows.md §5). */
@Injectable()
export class DesignBasisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly changes: ChangeLogService,
    private readonly outbox: OutboxService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
    private readonly projects: ProjectAccessService,
    private readonly signatures: SignatureService,
  ) {}

  private async access(user: AuthUser, projectId: string, tx?: Tx): Promise<ProjectAccess> {
    const a = await this.projects.resolve(user, projectId, tx);
    if (!a || !user.permissions.has('document.read')) throw new Problem('NOT_FOUND');
    return a;
  }

  private async load(user: AuthUser, id: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const row = await db.designBasis.findUnique({ where: { id }, include });
    if (!row) throw new Problem('NOT_FOUND');
    const access = await this.access(user, row.projectId, tx);
    return { row, access };
  }

  private assertEditable(user: AuthUser, access: ProjectAccess): void {
    if (!user.permissions.has('designbasis.edit')) throw new Problem('FORBIDDEN');
    if (access.readOnly || !documentsEditable(access.project.status)) {
      throw new Problem('DOC_PROJECT_NOT_EDITABLE', { rule: 'BR-DOC-014' });
    }
  }

  // ───────────────────────── read ─────────────────────────

  async list(user: AuthUser, projectId: string): Promise<DesignBasisSummaryDto[]> {
    await this.access(user, projectId);
    const rows = await this.prisma.designBasis.findMany({
      where: { projectId },
      include: {
        approvedBy: { select: { id: true, displayNameTh: true } },
        _count: { select: { items: true } },
      },
      orderBy: { revNo: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      revNo: r.revNo,
      title: r.title,
      status: r.status,
      approvedAt: iso(r.approvedAt),
      approvedBy: r.approvedBy
        ? { id: r.approvedBy.id, displayName: r.approvedBy.displayNameTh }
        : null,
      itemCount: r._count.items,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async get(user: AuthUser, id: string): Promise<DesignBasisDto> {
    const { row, access } = await this.load(user, id);
    return this.toDto(user, access, row);
  }

  private async toDto(user: AuthUser, access: ProjectAccess, r: Row): Promise<DesignBasisDto> {
    const creator = r.createdById
      ? await this.prisma.user.findUnique({
          where: { id: r.createdById },
          select: { id: true, displayNameTh: true },
        })
      : null;
    const signature =
      r.status !== 'DRAFT'
        ? await this.prisma.signatureEvent.findFirst({
            where: { entityType: 'DesignBasis', entityId: r.id, purpose: 'designbasis.approve' },
            select: { id: true },
          })
        : null;
    const limits = new Map((r.targetStandard?.limits ?? []).map((l) => [l.parameterId, l]));
    const allowed: string[] = [];
    const blocked: { action: string; code: string }[] = [];
    const editable = !access.readOnly && documentsEditable(access.project.status);
    if (r.status === 'DRAFT' && editable) {
      if (user.permissions.has('designbasis.edit')) allowed.push('edit');
      if (user.permissions.has('designbasis.approve')) {
        if (r.createdById === user.id)
          blocked.push({ action: 'approve', code: 'DBS_SELF_APPROVAL' });
        else allowed.push('approve');
      }
    }
    if (r.status !== 'DRAFT' && editable && user.permissions.has('designbasis.edit')) {
      const draft = await this.prisma.designBasis.count({
        where: { projectId: r.projectId, status: 'DRAFT' },
      });
      if (draft) blocked.push({ action: 'newRevision', code: 'DBS_DRAFT_EXISTS' });
      else allowed.push('newRevision');
    }
    return {
      id: r.id,
      projectId: r.projectId,
      revNo: r.revNo,
      title: r.title,
      status: r.status,
      averageFlowM3PerDay: decimalToString(r.averageFlowM3PerDay),
      peakFactor: decimalToString(r.peakFactor),
      designHorizonYear: r.designHorizonYear,
      populationEquivalent: r.populationEquivalent,
      targetStandardId: r.targetStandardId,
      targetStandardName: r.targetStandard?.nameTh ?? null,
      notes: r.notes,
      approvedAt: iso(r.approvedAt),
      approvedBy: r.approvedBy
        ? { id: r.approvedBy.id, displayName: r.approvedBy.displayNameTh }
        : null,
      createdBy: creator ? { id: creator.id, displayName: creator.displayNameTh } : null,
      signatureEventId: signature?.id ?? null,
      itemCount: r.items.length,
      items: r.items.map((i) => {
        const l = i.parameterId ? limits.get(i.parameterId) : undefined;
        return {
          id: i.id,
          parameterId: i.parameterId,
          parameterCode: i.parameter?.code ?? null,
          name: i.name,
          unit: i.unit,
          influentValue: decimalToString(i.influentValue),
          influentMin: decimalToString(i.influentMin),
          influentMax: decimalToString(i.influentMax),
          targetEffluentValue: decimalToString(i.targetEffluentValue),
          source: i.source,
          sourceNote: i.sourceNote,
          sampleTestIds: i.sampleTestIds,
          standardLimit: l
            ? {
                parameterId: l.parameterId,
                comparator: l.comparator,
                minValue: decimalToString(l.minValue),
                maxValue: decimalToString(l.maxValue),
                unit: l.unit,
                note: l.note,
              }
            : null,
          sortOrder: i.sortOrder,
        };
      }),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      version: r.version,
      allowedActions: allowed,
      blockedActions: blocked,
    };
  }

  async parameters(): Promise<ParameterRefDto[]> {
    const rows = await this.prisma.parameter.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      nameTh: p.nameTh,
      nameEn: p.nameEn,
      defaultUnit: p.defaultUnit,
      category: p.category,
    }));
  }

  async standards(): Promise<StandardRefDto[]> {
    const rows = await this.prisma.regulatoryStandard.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((s) => ({
      id: s.id,
      code: s.code,
      nameTh: s.nameTh,
      category: s.category,
      subtype: s.subtype,
    }));
  }

  // ───────────────────────── write ─────────────────────────

  /** BR-DOC-081: a new revNo copies the latest revision; only one DRAFT at a time. */
  async create(
    user: AuthUser,
    projectId: string,
    dto: CreateDesignBasisDto,
  ): Promise<DesignBasisDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const access = await this.access(user, projectId, tx);
      this.assertEditable(user, access);
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
      const all = await tx.designBasis.findMany({
        where: { projectId },
        include: { items: true },
        orderBy: { revNo: 'desc' },
      });
      if (all.some((d) => d.status === 'DRAFT'))
        throw new Problem('DBS_DRAFT_EXISTS', { rule: 'BR-DOC-081' });
      const latest = all[0];
      const id = this.ids.next();
      const now = this.clock.now();
      await tx.designBasis.create({
        data: {
          id,
          projectId,
          revNo: (latest?.revNo ?? 0) + 1,
          title: dto.title ?? latest?.title ?? access.project.name,
          averageFlowM3PerDay: latest?.averageFlowM3PerDay ?? null,
          peakFactor: latest?.peakFactor ?? null,
          designHorizonYear: latest?.designHorizonYear ?? null,
          populationEquivalent: latest?.populationEquivalent ?? null,
          targetStandardId: latest?.targetStandardId ?? null,
          notes: latest?.notes ?? null,
          createdById: user.id,
          createdAt: now,
        },
      });
      for (const i of latest?.items ?? []) {
        await tx.designBasisItem.create({
          data: {
            id: this.ids.next(),
            designBasisId: id,
            parameterId: i.parameterId,
            name: i.name,
            unit: i.unit,
            influentValue: i.influentValue,
            influentMin: i.influentMin,
            influentMax: i.influentMax,
            targetEffluentValue: i.targetEffluentValue,
            source: i.source,
            sourceNote: i.sourceNote,
            sampleTestIds: i.sampleTestIds,
            sortOrder: i.sortOrder,
          },
        });
      }
      await this.audit.record(tx, {
        action: 'designbasis.create',
        entityType: 'DesignBasis',
        entityId: id,
        projectId,
        summary: `rev ${(latest?.revNo ?? 0) + 1}`,
      });
      await this.touch(tx, projectId, id);
      return id;
    });
    return this.get(user, id);
  }

  /** PATCH replaces the item set (M04 §10); DRAFT only (BR-DOC-081); BR-DOC-082 sources. */
  async update(user: AuthUser, id: string, dto: UpdateDesignBasisDto): Promise<DesignBasisDto> {
    await this.prisma.$transaction(async (tx) => {
      const { row, access } = await this.load(user, id, tx);
      this.assertEditable(user, access);
      assertDraft(row.status);
      if (dto.items) {
        const errors = sourceErrors(dto.items);
        if (errors.length)
          throw new Problem('DBS_SOURCE_NOTE_REQUIRED', { rule: 'BR-DOC-082', errors });
        await this.assertParameters(tx, dto.items);
      }
      if (dto.targetStandardId) {
        const s = await tx.regulatoryStandard.findUnique({
          where: { id: dto.targetStandardId },
          select: { id: true },
        });
        if (!s)
          throw new Problem('VALIDATION_FAILED', {
            errors: [{ field: 'targetStandardId', code: 'NOT_FOUND' }],
          });
      }
      const res = await tx.designBasis.updateMany({
        where: { id, version: dto.version },
        data: {
          title: dto.title,
          averageFlowM3PerDay: dec(dto.averageFlowM3PerDay),
          peakFactor: dec(dto.peakFactor),
          designHorizonYear: dto.designHorizonYear,
          populationEquivalent: dto.populationEquivalent,
          targetStandardId: dto.targetStandardId,
          notes: dto.notes,
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        async () =>
          this.toDto(
            user,
            access,
            await tx.designBasis.findUniqueOrThrow({ where: { id }, include }),
          ),
      );
      if (dto.items) {
        await tx.designBasisItem.deleteMany({ where: { designBasisId: id } });
        for (const [n, i] of dto.items.entries()) {
          await tx.designBasisItem.create({
            data: {
              id: this.ids.next(),
              designBasisId: id,
              parameterId: i.parameterId ?? null,
              name: i.name,
              unit: i.unit,
              influentValue: dec(i.influentValue) ?? null,
              influentMin: dec(i.influentMin) ?? null,
              influentMax: dec(i.influentMax) ?? null,
              targetEffluentValue: dec(i.targetEffluentValue) ?? null,
              source: i.source,
              sourceNote: i.sourceNote ?? null,
              sampleTestIds: i.sampleTestIds ?? [],
              sortOrder: n,
            },
          });
        }
      }
      await this.audit.record(tx, {
        action: 'designbasis.update',
        entityType: 'DesignBasis',
        entityId: id,
        projectId: row.projectId,
        summary: dto.items ? `${dto.items.length} items` : undefined,
      });
      await this.touch(tx, row.projectId, id);
    });
    return this.get(user, id);
  }

  private async assertParameters(tx: Tx, items: DesignBasisItemInputDto[]): Promise<void> {
    const ids = [...new Set(items.map((i) => i.parameterId).filter((x): x is string => !!x))];
    if (!ids.length) return;
    const n = await tx.parameter.count({ where: { id: { in: ids } } });
    if (n !== ids.length)
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'items.parameterId', code: 'NOT_FOUND' }],
      });
  }

  /**
   * DRAFT → APPROVED with a signature (BR-DOC-083); the previous APPROVED revision becomes
   * SUPERSEDED (BR-DOC-080). The signature binds a hash of the approved content.
   */
  async approve(user: AuthUser, id: string, dto: ApproveDesignBasisDto): Promise<DesignBasisDto> {
    const pre = await this.load(user, id);
    if (!user.permissions.has('designbasis.approve')) throw new Problem('FORBIDDEN');
    assertNotSelfApproval(pre.row.createdById, user.id);
    const method = await this.signatures.verify(user, dto.signature);
    await this.prisma.$transaction(async (tx) => {
      const { row, access } = await this.load(user, id, tx);
      if (access.readOnly || !documentsEditable(access.project.status)) {
        throw new Problem('DOC_PROJECT_NOT_EDITABLE', { rule: 'BR-DOC-014' });
      }
      const to = assertDesignBasisTransition(row.status, 'approve');
      assertNotSelfApproval(row.createdById, user.id);
      const errors = sourceErrors(row.items);
      if (errors.length)
        throw new Problem('DBS_SOURCE_NOTE_REQUIRED', { rule: 'BR-DOC-082', errors });
      const now = this.clock.now();
      const res = await tx.designBasis.updateMany({
        where: { id, version: dto.version },
        data: { status: to, approvedById: user.id, approvedAt: now, ...bumpVersion },
      });
      await assertVersionedUpdate(res, () => Promise.resolve(true));
      const previous = await tx.designBasis.findMany({
        where: { projectId: row.projectId, status: 'APPROVED', id: { not: id } },
        select: { id: true, status: true },
      });
      for (const p of previous) {
        await tx.designBasis.update({
          where: { id: p.id },
          data: { status: assertDesignBasisTransition(p.status, 'supersede'), ...bumpVersion },
        });
        await this.touch(tx, row.projectId, p.id);
      }
      const contentSha256 = sha256Hex(
        canonicalJson({
          revNo: row.revNo,
          averageFlowM3PerDay: decimalToString(row.averageFlowM3PerDay),
          peakFactor: decimalToString(row.peakFactor),
          targetStandardId: row.targetStandardId,
          items: row.items.map((i) => ({
            name: i.name,
            unit: i.unit,
            influentValue: decimalToString(i.influentValue),
            influentMin: decimalToString(i.influentMin),
            influentMax: decimalToString(i.influentMax),
            targetEffluentValue: decimalToString(i.targetEffluentValue),
            source: i.source,
          })),
        }),
      );
      await this.signatures.record(tx, user.id, method, {
        purpose: 'designbasis.approve',
        entityType: 'DesignBasis',
        entityId: id,
        decision: 'APPROVED',
        fileSha256: contentSha256,
      });
      await this.audit.record(tx, {
        action: 'designbasis.approve',
        entityType: 'DesignBasis',
        entityId: id,
        projectId: row.projectId,
        summary: `rev ${row.revNo}${previous.length ? ` (supersedes ${previous.length})` : ''}`,
      });
      await this.touch(tx, row.projectId, id);
      await this.outbox.publish(
        tx,
        'designbasis.approved',
        { designBasisId: id, projectId: row.projectId },
        id,
      );
    });
    return this.get(user, id);
  }

  private async touch(tx: Tx, projectId: string, id: string): Promise<void> {
    await this.changes.touch(tx, Scope.project(projectId), 'DesignBasis', id);
  }
}
