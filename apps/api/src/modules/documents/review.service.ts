import { Injectable } from '@nestjs/common';
import type { ProjectRole } from '../../generated/prisma/enums';
import { AuditService } from '../../common/audit/audit.service';
import { ChangeLogService, Scope } from '../../common/audit/change-log.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { Problem } from '../../common/errors/problem';
import { csv } from '../../common/http/pagination';
import { IdGenerator } from '../../common/ids/id-generator';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  assertVersionedUpdate,
  bumpVersion,
  iso,
  notDeleted,
  type Tx,
} from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../../common/settings/settings.service';
import { bangkokDate, computeDueAt } from '../../common/time/business-calendar';
import { ClockService } from '../../common/time/clock';
import { SignatureService } from '../platform/auth/signature.service';
import { DocumentAccessService, type RevisionContext } from './document-access.service';
import {
  checkLicense,
  eligibilityError,
  type LicenseInfo,
  needsLicense,
  separationErrors,
} from './domain/approver-eligibility';
import { advanceCycle, assertStepTransition } from './domain/review-state-machine';
import { assertRevisionTransition } from './domain/revision-state-machine';
import type {
  DecisionDto,
  EligibleReviewersDto,
  MyReviewStepDto,
  ReassignDto,
  ReviewCycleDto,
  ReviewStepsQueryDto,
  RevisionDto,
  SubmitResultDto,
  SubmitRevisionDto,
  VersionReasonBodyDto,
} from './dto/revisions.dto';
import { revisionInclude, RevisionsService, toCycleDto } from './revisions.service';

interface CandidateUser {
  id: string;
  displayNameTh: string;
  position: string | null;
  isActive: boolean;
  permissions: Set<string>;
  projectRole: ProjectRole | null;
  licenses: LicenseInfo[];
  licenseNos: Map<string, string>;
}

/** Review workflow: submit, decide, reassign, skip, cancel (BR-DOC-030..043, 05-workflows §2). */
@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly changes: ChangeLogService,
    private readonly outbox: OutboxService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
    private readonly docAccess: DocumentAccessService,
    private readonly revisions: RevisionsService,
    private readonly signatures: SignatureService,
  ) {}

  // ───────────────────────── candidates ─────────────────────────

  /** Users who could be assignees: active project members (+ their permissions and licences). */
  private async candidates(
    tx: Tx,
    projectId: string,
    userIds?: string[],
  ): Promise<Map<string, CandidateUser>> {
    const members = await tx.projectMember.findMany({
      where: { projectId, removedAt: null, ...(userIds ? { userId: { in: userIds } } : {}) },
      select: { userId: true, role: true },
    });
    const ids = [...new Set([...members.map((m) => m.userId), ...(userIds ?? [])])];
    const users = await tx.user.findMany({
      where: { id: { in: ids }, ...notDeleted },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
        licenses: true,
      },
    });
    const roleOf = new Map(members.map((m) => [m.userId, m.role]));
    const out = new Map<string, CandidateUser>();
    for (const u of users) {
      out.set(u.id, {
        id: u.id,
        displayNameTh: u.displayNameTh,
        position: u.position,
        isActive: u.isActive,
        permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission))),
        projectRole: roleOf.get(u.id) ?? null,
        licenses: u.licenses
          .filter((l) => l.branch && l.level)
          .map((l) => ({
            id: l.id,
            type: l.type,
            branch: l.branch!,
            level: l.level!,
            expiresAt: bangkokDate(l.expiresAt),
            isActive: l.isActive,
            verified: !!l.verifiedAt,
          })),
        licenseNos: new Map(u.licenses.map((l) => [l.id, l.licenseNo])),
      });
    }
    return out;
  }

  /** read_all users without membership may still be assignees if they can see the project. */
  private canAccess(c: CandidateUser): boolean {
    return c.projectRole !== null || c.permissions.has('project.read_all');
  }

  /** Authors for BR-DOC-042: the preparer and the uploader of the PDF being reviewed. */
  private async authors(tx: Tx, rev: { id: string; preparedById: string }): Promise<string[]> {
    const pdf = await tx.documentFile.findFirst({
      where: { revisionId: rev.id, role: 'PDF_RENDITION', isCurrent: true },
      select: { uploadedById: true },
    });
    return [...new Set([rev.preparedById, ...(pdf ? [pdf.uploadedById] : [])])];
  }

  private async templateFor(tx: Tx, ctx: RevisionContext, templateId?: string | null) {
    const type = await tx.documentType.findUniqueOrThrow({ where: { id: ctx.doc.documentTypeId } });
    const id = templateId ?? ctx.doc.workflowTemplateId ?? type.defaultWorkflowTemplateId;
    if (!id)
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'templateId', code: 'REQUIRED' }],
      });
    const template = await tx.workflowTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: [{ stepOrder: 'asc' }, { name: 'asc' }] } },
    });
    if (!template?.isActive) {
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'templateId', code: 'NOT_FOUND' }],
      });
    }
    return { template, type };
  }

  async eligible(
    user: AuthUser,
    revisionId: string,
    templateId?: string,
    templateStepId?: string,
  ): Promise<EligibleReviewersDto> {
    const ctx = await this.docAccess.revision(user, revisionId);
    if (ctx.rev.preparedById !== user.id && !user.permissions.has('document.edit'))
      throw new Problem('FORBIDDEN');
    const { template, type } = await this.templateFor(this.prisma, ctx, templateId);
    const users = await this.candidates(this.prisma, ctx.doc.projectId);
    const authors = await this.authors(this.prisma, ctx.rev);
    const holidays = await this.settings.get('calendar.holidays');
    const now = this.clock.now();
    const today = bangkokDate(now);
    // suggestion: assignees used on the same document type in this project (M04 §5)
    const recent = await this.prisma.reviewStep.findMany({
      where: {
        cycle: {
          revision: {
            document: { projectId: ctx.doc.projectId, documentTypeId: ctx.doc.documentTypeId },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { kind: true, name: true, assigneeId: true },
    });
    const sod = ctx.access.project.requireSeparationOfDuties;
    const steps = template.steps
      .filter((s) => !templateStepId || s.id === templateStepId)
      .map((s) => {
        const due = computeDueAt(now, s.dueDays, holidays);
        const lic = needsLicense(type, s);
        const list = [...users.values()]
          .filter((u) => u.isActive)
          .map((u) => {
            let reason = eligibilityError(
              {
                userId: u.id,
                isActive: u.isActive,
                permissions: u.permissions,
                projectRole: u.projectRole,
                canAccessProject: this.canAccess(u),
              },
              s,
            );
            if (
              !reason &&
              sod &&
              (s.kind === 'CHECK' || s.kind === 'APPROVE') &&
              authors.includes(u.id)
            ) {
              reason = 'DOC_SEPARATION_OF_DUTIES';
            }
            let license: EligibleReviewersDto['steps'][number]['candidates'][number]['license'] =
              null;
            let expiresBeforeDue = false;
            if (lic) {
              const check = checkLicense(type, u.licenses, today);
              if (!check.ok && !reason) reason = check.code;
              if (check.license) {
                license = {
                  id: check.license.id,
                  licenseNo: u.licenseNos.get(check.license.id) ?? '',
                  branch: check.license.branch,
                  level: check.license.level,
                  expiresAt: check.license.expiresAt,
                };
                expiresBeforeDue = check.ok && check.license.expiresAt < bangkokDate(due);
              }
            }
            return {
              userId: u.id,
              displayName: u.displayNameTh,
              position: u.position,
              projectRole: u.projectRole,
              eligible: !reason,
              reason,
              license,
              licenseExpiresBeforeDue: expiresBeforeDue,
              suggested: recent.some(
                (r) => r.assigneeId === u.id && r.kind === s.kind && r.name === s.name,
              ),
            };
          })
          .sort(
            (a, b) =>
              Number(b.eligible) - Number(a.eligible) ||
              Number(b.suggested) - Number(a.suggested) ||
              a.displayName.localeCompare(b.displayName, 'th'),
          );
        return {
          templateStepId: s.id,
          stepOrder: s.stepOrder,
          kind: s.kind,
          name: s.name,
          isOptional: s.isOptional,
          requiresSignature: s.requiresSignature,
          needsLicense: lic,
          dueDays: s.dueDays,
          estimatedDueAt: due.toISOString(),
          candidates: list,
        };
      });
    return { templateId: template.id, steps };
  }

  // ───────────────────────── submit ─────────────────────────

  /** BR-DOC-030: submit a DRAFT for review with the chosen assignees. */
  async submit(
    user: AuthUser,
    revisionId: string,
    dto: SubmitRevisionDto,
  ): Promise<SubmitResultDto> {
    const warnings: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const ctx = await this.docAccess.revision(user, revisionId, tx);
      const { rev, doc, access } = ctx;
      if (rev.preparedById !== user.id && !user.permissions.has('document.edit'))
        throw new Problem('FORBIDDEN');
      this.docAccess.assertProjectEditable(access);
      if (doc.status !== 'ACTIVE') throw new Problem('DOC_NOT_ACTIVE');
      assertRevisionTransition(rev.status, 'submit');
      const blocker = await this.revisions.submitBlocker(ctx, rev, tx);
      if (blocker) {
        const rule = blocker === 'DOC_REVISION_DESCRIPTION_REQUIRED' ? 'BR-DOC-027' : 'BR-DOC-030';
        throw new Problem(blocker as 'DOC_PDF_RENDITION_REQUIRED', { rule });
      }
      const { template, type } = await this.templateFor(tx, ctx, dto.templateId);
      // every non-optional step needs at least one assignee; entries must belong to the template
      const errors: { field: string; code: string }[] = [];
      dto.steps.forEach((s, i) => {
        if (!template.steps.some((t) => t.id === s.templateStepId)) {
          errors.push({ field: `steps[${i}].templateStepId`, code: 'NOT_FOUND' });
        }
      });
      if (errors.length) throw new Problem('VALIDATION_FAILED', { errors });
      const missing = template.steps.filter(
        (t) => !t.isOptional && !dto.steps.some((s) => s.templateStepId === t.id),
      );
      if (missing.length) {
        throw new Problem('DOC_ASSIGNEE_REQUIRED', {
          rule: 'BR-DOC-030',
          errors: missing.map((m) => ({
            field: `steps.${m.id}`,
            code: 'REQUIRED',
            message: m.name,
          })),
        });
      }
      const dup = new Set<string>();
      dto.steps.forEach((s, i) => {
        const k = `${s.templateStepId}:${s.assigneeId}`;
        if (dup.has(k)) errors.push({ field: `steps[${i}].assigneeId`, code: 'DUPLICATE' });
        dup.add(k);
      });
      if (errors.length) throw new Problem('VALIDATION_FAILED', { errors });

      // BR-DOC-041 eligibility, BR-DOC-042 separation of duties, BR-DOC-040 licences
      const users = await this.candidates(
        tx,
        doc.projectId,
        dto.steps.map((s) => s.assigneeId),
      );
      const now = this.clock.now();
      const today = bangkokDate(now);
      const holidays = await this.settings.get('calendar.holidays');
      const notEligible: { field: string; code: string }[] = [];
      const licenseErrors: { field: string; code: string }[] = [];
      dto.steps.forEach((s, i) => {
        const t = template.steps.find((x) => x.id === s.templateStepId)!;
        const u = users.get(s.assigneeId);
        const reason = u
          ? eligibilityError(
              {
                userId: u.id,
                isActive: u.isActive,
                permissions: u.permissions,
                projectRole: u.projectRole,
                canAccessProject: this.canAccess(u),
              },
              t,
            )
          : 'DOC_ASSIGNEE_NOT_ELIGIBLE';
        if (reason) notEligible.push({ field: `steps[${i}].assigneeId`, code: reason });
        else if (needsLicense(type, t)) {
          const check = checkLicense(type, u!.licenses, today);
          if (!check.ok) licenseErrors.push({ field: `steps[${i}].assigneeId`, code: check.code });
          else if (
            check.license &&
            check.license.expiresAt < bangkokDate(computeDueAt(now, t.dueDays, holidays))
          ) {
            warnings.push('LICENSE_EXPIRES_BEFORE_DUE');
          }
        }
      });
      if (notEligible.length)
        throw new Problem('DOC_ASSIGNEE_NOT_ELIGIBLE', { rule: 'BR-DOC-041', errors: notEligible });
      if (access.project.requireSeparationOfDuties) {
        const bad = separationErrors(
          dto.steps.map((s, i) => ({
            key: String(i),
            kind: template.steps.find((x) => x.id === s.templateStepId)!.kind,
            assigneeId: s.assigneeId,
          })),
          await this.authors(tx, rev),
        );
        if (bad.length) {
          throw new Problem('DOC_SEPARATION_OF_DUTIES', {
            rule: 'BR-DOC-042',
            errors: bad.map((i) => ({
              field: `steps[${i}].assigneeId`,
              code: 'DOC_SEPARATION_OF_DUTIES',
            })),
          });
        }
      }
      if (licenseErrors.length) {
        throw new Problem(licenseErrors[0]!.code as 'DOC_LICENSE_REQUIRED', {
          rule: 'BR-DOC-040',
          errors: licenseErrors,
        });
      }

      // BR-DOC-039: pin the reviewed file
      const pdf = await tx.documentFile.findFirst({
        where: { revisionId, role: 'PDF_RENDITION', isCurrent: true },
        include: { file: true },
      });
      const res = await tx.documentRevision.updateMany({
        where: { id: revisionId, version: dto.version, status: 'DRAFT' },
        data: { status: 'IN_REVIEW', lockedAt: now, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.revisions.get(user, revisionId),
      );
      const last = await tx.reviewCycle.findFirst({
        where: { revisionId },
        orderBy: { cycleNo: 'desc' },
      });
      const cycleId = this.ids.next();
      await tx.reviewCycle.create({
        data: {
          id: cycleId,
          revisionId,
          cycleNo: (last?.cycleNo ?? 0) + 1,
          templateId: template.id,
          reviewedFileId: pdf?.fileId ?? null,
          reviewedFileSha256: pdf?.file.sha256 ?? null,
          submittedById: user.id,
          submittedAt: now,
          submitNote: dto.note ?? null,
        },
      });
      for (const s of dto.steps) {
        const t = template.steps.find((x) => x.id === s.templateStepId)!;
        await tx.reviewStep.create({
          data: {
            id: this.ids.next(),
            cycleId,
            stepOrder: t.stepOrder,
            kind: t.kind,
            name: t.name,
            assigneeId: s.assigneeId,
            requiresSignature: t.requiresSignature,
            requiresLicense: t.requiresLicense,
            isOptional: t.isOptional,
            createdAt: now,
          },
        });
      }
      // steps keep the template's dueDays through the template copy (M04 §5)
      await this.progress(tx, ctx, cycleId, user);
      await this.audit.record(tx, {
        action: 'document.revision.submit',
        entityType: 'DocumentRevision',
        entityId: revisionId,
        projectId: doc.projectId,
        summary: `${doc.number} Rev.${rev.revLabel} → ${template.code}`,
        changes: {
          before: { status: 'DRAFT' },
          after: { status: 'IN_REVIEW', assignees: dto.steps.map((s) => s.assigneeId) },
        },
      });
      await this.touchRevision(tx, doc.projectId, doc.id, revisionId);
      await this.outbox.publish(
        tx,
        'revision.submitted',
        { revisionId, documentId: doc.id, projectId: doc.projectId, cycleId },
        revisionId,
      );
    });
    return { ...(await this.revisions.get(user, revisionId)), warnings: [...new Set(warnings)] };
  }

  private async touchRevision(tx: Tx, projectId: string, documentId: string, revisionId: string) {
    await this.changes.touch(tx, Scope.project(projectId), 'DocumentRevision', revisionId);
    await this.changes.touch(tx, Scope.project(projectId), 'Document', documentId);
  }

  /**
   * BR-DOC-031/032 + 05-workflows §1/§2 system transitions: activate the next group, or finish the
   * cycle as APPROVED / REJECTED and update the revision and the document.
   */
  private async progress(
    tx: Tx,
    ctx: RevisionContext,
    cycleId: string,
    actor: AuthUser,
  ): Promise<void> {
    const steps = await tx.reviewStep.findMany({ where: { cycleId } });
    const result = advanceCycle(steps);
    const now = this.clock.now();
    const { doc } = ctx;
    const revisionId = ctx.rev.id;
    if (result.outcome === 'IN_PROGRESS') {
      const holidays = await this.settings.get('calendar.holidays');
      const cycle = await tx.reviewCycle.findUniqueOrThrow({
        where: { id: cycleId },
        include: { template: { include: { steps: true } } },
      });
      for (const id of result.activate) {
        const s = steps.find((x) => x.id === id)!;
        const t = cycle.template?.steps.find(
          (x) => x.stepOrder === s.stepOrder && x.name === s.name && x.kind === s.kind,
        );
        const dueDays = t?.dueDays ?? (await this.settings.get('review.defaultDueDays'));
        assertStepTransition(s, 'activate');
        await tx.reviewStep.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            activatedAt: now,
            dueAt: computeDueAt(now, dueDays, holidays),
            ...bumpVersion,
          },
        });
        await this.changes.touch(tx, Scope.user(s.assigneeId), 'ReviewStep', id);
        await this.outbox.publish(
          tx,
          'review.step.activated',
          {
            stepId: id,
            assigneeId: s.assigneeId,
            revisionId,
            documentId: doc.id,
            projectId: doc.projectId,
          },
          id,
        );
      }
      return;
    }
    for (const id of result.cancel) {
      const s = steps.find((x) => x.id === id)!;
      await tx.reviewStep.update({ where: { id }, data: { status: 'CANCELLED', ...bumpVersion } });
      await this.changes.touch(tx, Scope.user(s.assigneeId), 'ReviewStep', id);
    }
    await tx.reviewCycle.update({
      where: { id: cycleId },
      data: { status: result.outcome, completedAt: now, ...bumpVersion },
    });
    if (result.outcome === 'REJECTED') {
      // BR-DOC-032: back to DRAFT and unlock files
      assertRevisionTransition('IN_REVIEW', 'reject');
      await tx.documentRevision.update({
        where: { id: revisionId },
        data: { status: 'DRAFT', lockedAt: null, lastCycleOutcome: 'REJECTED', ...bumpVersion },
      });
      await this.outbox.publish(
        tx,
        'revision.rejected',
        {
          revisionId,
          documentId: doc.id,
          projectId: doc.projectId,
          preparedById: ctx.rev.preparedById,
          ownerId: doc.ownerId,
        },
        revisionId,
      );
    } else {
      assertRevisionTransition('IN_REVIEW', 'approve');
      const approver = [...steps]
        .reverse()
        .find(
          (s) =>
            s.kind === 'APPROVE' &&
            (s.status === 'APPROVED' || s.status === 'APPROVED_WITH_COMMENTS'),
        );
      const checker = steps.find(
        (s) =>
          s.kind === 'CHECK' && (s.status === 'APPROVED' || s.status === 'APPROVED_WITH_COMMENTS'),
      );
      await tx.documentRevision.update({
        where: { id: revisionId },
        data: {
          status: 'APPROVED',
          approvedAt: now,
          approvedById: approver?.assigneeId ?? actor.id,
          checkedById: checker?.assigneeId ?? null,
          lastCycleOutcome: 'APPROVED',
          ...bumpVersion,
        },
      });
      // earlier approved/issued revisions are superseded (05-workflows §1)
      const older = await tx.documentRevision.findMany({
        where: {
          documentId: doc.id,
          id: { not: revisionId },
          status: { in: ['APPROVED', 'ISSUED'] },
        },
      });
      for (const o of older) {
        assertRevisionTransition(o.status, 'supersede');
        await tx.documentRevision.update({
          where: { id: o.id },
          data: { status: 'SUPERSEDED', ...bumpVersion },
        });
        await this.changes.touch(tx, Scope.project(doc.projectId), 'DocumentRevision', o.id);
        await this.outbox.publish(
          tx,
          'revision.superseded',
          {
            revisionId: o.id,
            byRevisionId: revisionId,
            documentId: doc.id,
            projectId: doc.projectId,
          },
          o.id,
        );
      }
      await tx.document.update({
        where: { id: doc.id },
        data: { latestApprovedRevisionId: revisionId, ...bumpVersion },
      });
      await this.outbox.publish(
        tx,
        'revision.approved',
        {
          revisionId,
          documentId: doc.id,
          projectId: doc.projectId,
          preparedById: ctx.rev.preparedById,
          ownerId: doc.ownerId,
        },
        revisionId,
      );
    }
  }

  // ───────────────────────── step actions ─────────────────────────

  private async stepContext(user: AuthUser, stepId: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const step = await db.reviewStep.findUnique({
      where: { id: stepId },
      include: { cycle: true },
    });
    if (!step) throw new Problem('NOT_FOUND');
    const ctx = await this.docAccess.revision(user, step.cycle.revisionId, tx);
    return { step, ctx };
  }

  /** decide (BR-DOC-033, 039–043); only the assignee of an ACTIVE step. */
  async decide(user: AuthUser, stepId: string, dto: DecisionDto): Promise<RevisionDto> {
    const pre = await this.stepContext(user, stepId);
    if (pre.step.assigneeId !== user.id) throw new Problem('DOC_NOT_ASSIGNEE');
    // re-authentication happens before the transaction so failures still count (06-security §4)
    const method = pre.step.requiresSignature
      ? await this.signatures.verify(user, dto.signature)
      : null;
    await this.prisma.$transaction(async (tx) => {
      const { step, ctx } = await this.stepContext(user, stepId, tx);
      if (step.assigneeId !== user.id) throw new Problem('DOC_NOT_ASSIGNEE');
      if (step.cycle.status !== 'IN_PROGRESS') throw new Problem('DOC_STEP_NOT_ACTIVE');
      const to = assertStepTransition(step, 'decide', dto.decision);
      // BR-DOC-033
      if (dto.decision === 'APPROVED_WITH_COMMENTS') {
        const n = await tx.comment.count({
          where: { reviewStepId: stepId, ownerId: ctx.rev.id, parentId: null, ...notDeleted },
        });
        if (!n) throw new Problem('DOC_COMMENT_REQUIRED', { rule: 'BR-DOC-033' });
      }
      if (dto.decision === 'REJECTED' && !dto.note?.trim()) {
        const open = await tx.comment.count({
          where: {
            reviewStepId: stepId,
            ownerId: ctx.rev.id,
            parentId: null,
            status: 'OPEN',
            ...notDeleted,
          },
        });
        if (!open) throw new Problem('DOC_COMMENT_REQUIRED', { rule: 'BR-DOC-033' });
      }
      // BR-DOC-039: the reviewed file must still be the pinned one
      if (step.cycle.reviewedFileId) {
        const f = await tx.fileObject.findUnique({
          where: { id: step.cycle.reviewedFileId },
          select: { sha256: true },
        });
        if (f?.sha256 !== step.cycle.reviewedFileSha256)
          throw new Problem('DOC_REVISION_LOCKED', { rule: 'BR-DOC-039' });
      }
      // BR-DOC-040 re-check on the decision date (approvals only)
      let licenseId: string | null = null;
      if (dto.decision !== 'REJECTED') {
        const type = await tx.documentType.findUniqueOrThrow({
          where: { id: ctx.doc.documentTypeId },
        });
        if (needsLicense(type, step)) {
          const users = await this.candidates(tx, ctx.doc.projectId, [user.id]);
          const check = checkLicense(
            type,
            users.get(user.id)?.licenses ?? [],
            bangkokDate(this.clock.now()),
          );
          if (!check.ok) throw new Problem(check.code, { rule: 'BR-DOC-040' });
          licenseId = check.license?.id ?? null;
        }
      }
      let signatureEventId: string | null = null;
      if (step.requiresSignature) {
        signatureEventId = await this.signatures.record(tx, user.id, method!, {
          purpose: `review.${step.kind.toLowerCase()}`,
          entityType: 'ReviewStep',
          entityId: stepId,
          decision: dto.decision,
          note: dto.note ?? null,
          fileSha256: step.cycle.reviewedFileSha256,
          licenseId,
        });
      }
      const res = await tx.reviewStep.updateMany({
        where: { id: stepId, version: dto.version, status: 'ACTIVE' },
        data: {
          status: to,
          decidedAt: this.clock.now(),
          decisionNote: dto.note ?? null,
          signatureEventId,
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.revisions.get(user, ctx.rev.id),
      );
      await this.audit.record(tx, {
        action: `review.step.${dto.decision.toLowerCase()}`,
        entityType: 'ReviewStep',
        entityId: stepId,
        projectId: ctx.doc.projectId,
        summary: `${ctx.doc.number} Rev.${ctx.rev.revLabel} · ${step.name}`,
        changes: { before: { status: step.status }, after: { status: to, signatureEventId } },
        reason: dto.note ?? null,
      });
      await this.changes.touch(tx, Scope.user(step.assigneeId), 'ReviewStep', stepId);
      await this.progress(tx, ctx, step.cycleId, user);
      await this.touchRevision(tx, ctx.doc.projectId, ctx.doc.id, ctx.rev.id);
      await this.outbox.publish(
        tx,
        'review.step.decided',
        { stepId, decision: dto.decision, revisionId: ctx.rev.id, projectId: ctx.doc.projectId },
        stepId,
      );
    });
    return this.revisions.get(user, pre.ctx.rev.id);
  }

  /** BR-DOC-037: the assignee hands over, or PM / document.admin reassigns. */
  async reassign(user: AuthUser, stepId: string, dto: ReassignDto): Promise<RevisionDto> {
    const { ctx: pre } = await this.stepContext(user, stepId);
    await this.prisma.$transaction(async (tx) => {
      const { step, ctx } = await this.stepContext(user, stepId, tx);
      const allowed =
        step.assigneeId === user.id ||
        ctx.access.isProjectManager ||
        user.permissions.has('document.admin');
      if (!allowed) throw new Problem('FORBIDDEN', { rule: 'BR-DOC-037' });
      assertStepTransition(step, 'reassign');
      if (dto.assigneeId === step.assigneeId) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'assigneeId', code: 'SAME_ASSIGNEE' }],
        });
      }
      const template = step.cycle.templateId
        ? await tx.workflowTemplateStep.findFirst({
            where: {
              templateId: step.cycle.templateId,
              stepOrder: step.stepOrder,
              kind: step.kind,
              name: step.name,
            },
          })
        : null;
      const users = await this.candidates(tx, ctx.doc.projectId, [dto.assigneeId]);
      const u = users.get(dto.assigneeId);
      const reason = u
        ? eligibilityError(
            {
              userId: u.id,
              isActive: u.isActive,
              permissions: u.permissions,
              projectRole: u.projectRole,
              canAccessProject: this.canAccess(u),
            },
            { kind: step.kind, allowedProjectRoles: template?.allowedProjectRoles ?? [] },
          )
        : 'DOC_ASSIGNEE_NOT_ELIGIBLE';
      if (reason) {
        throw new Problem('DOC_ASSIGNEE_NOT_ELIGIBLE', {
          rule: 'BR-DOC-041',
          errors: [{ field: 'assigneeId', code: reason }],
        });
      }
      if (ctx.access.project.requireSeparationOfDuties) {
        const others = await tx.reviewStep.findMany({
          where: { cycleId: step.cycleId, id: { not: stepId }, status: { not: 'CANCELLED' } },
        });
        const bad = separationErrors(
          [
            ...others.map((o) => ({ key: o.id, kind: o.kind, assigneeId: o.assigneeId })),
            { key: stepId, kind: step.kind, assigneeId: dto.assigneeId },
          ],
          await this.authors(tx, ctx.rev),
        );
        if (bad.includes(stepId))
          throw new Problem('DOC_SEPARATION_OF_DUTIES', { rule: 'BR-DOC-042' });
      }
      const type = await tx.documentType.findUniqueOrThrow({
        where: { id: ctx.doc.documentTypeId },
      });
      if (needsLicense(type, step)) {
        const check = checkLicense(type, u!.licenses, bangkokDate(this.clock.now()));
        if (!check.ok) throw new Problem(check.code, { rule: 'BR-DOC-040' });
      }
      const res = await tx.reviewStep.updateMany({
        where: { id: stepId, version: dto.version, status: step.status },
        data: {
          assigneeId: dto.assigneeId,
          delegatedFromUserId: step.assigneeId,
          lastRemindedAt: null,
          ...bumpVersion,
        },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.revisions.get(user, ctx.rev.id),
      );
      await this.audit.record(tx, {
        action: 'review.step.reassign',
        entityType: 'ReviewStep',
        entityId: stepId,
        projectId: ctx.doc.projectId,
        changes: { before: { assigneeId: step.assigneeId }, after: { assigneeId: dto.assigneeId } },
        reason: dto.reason,
      });
      await this.changes.touch(tx, Scope.user(step.assigneeId), 'ReviewStep', stepId, 'DELETE');
      await this.changes.touch(tx, Scope.user(dto.assigneeId), 'ReviewStep', stepId);
      await this.outbox.publish(
        tx,
        'review.step.reassigned',
        {
          stepId,
          assigneeId: dto.assigneeId,
          previousAssigneeId: step.assigneeId,
          active: step.status === 'ACTIVE',
          revisionId: ctx.rev.id,
          projectId: ctx.doc.projectId,
          reason: dto.reason,
        },
        stepId,
      );
    });
    return this.revisions.get(user, pre.rev.id);
  }

  /** skip an optional step (PM / document.admin). */
  async skip(user: AuthUser, stepId: string, dto: VersionReasonBodyDto): Promise<RevisionDto> {
    const { ctx: pre } = await this.stepContext(user, stepId);
    await this.prisma.$transaction(async (tx) => {
      const { step, ctx } = await this.stepContext(user, stepId, tx);
      if (!ctx.access.isProjectManager && !user.permissions.has('document.admin'))
        throw new Problem('FORBIDDEN');
      if (step.cycle.status !== 'IN_PROGRESS') throw new Problem('DOC_STEP_NOT_ACTIVE');
      const to = assertStepTransition(step, 'skip');
      const res = await tx.reviewStep.updateMany({
        where: { id: stepId, version: dto.version, status: step.status },
        data: { status: to, decidedAt: this.clock.now(), decisionNote: dto.reason, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.revisions.get(user, ctx.rev.id),
      );
      await this.audit.record(tx, {
        action: 'review.step.skip',
        entityType: 'ReviewStep',
        entityId: stepId,
        projectId: ctx.doc.projectId,
        reason: dto.reason,
      });
      await this.changes.touch(tx, Scope.user(step.assigneeId), 'ReviewStep', stepId);
      await this.progress(tx, ctx, step.cycleId, user);
      await this.touchRevision(tx, ctx.doc.projectId, ctx.doc.id, ctx.rev.id);
    });
    return this.revisions.get(user, pre.rev.id);
  }

  /** cancel-review: the submitter, PM or document.admin (05-workflows §1). */
  async cancelReview(
    user: AuthUser,
    revisionId: string,
    dto: VersionReasonBodyDto,
  ): Promise<RevisionDto> {
    await this.prisma.$transaction(async (tx) => {
      const ctx = await this.docAccess.revision(user, revisionId, tx);
      const cycle = await tx.reviewCycle.findFirst({
        where: { revisionId, status: 'IN_PROGRESS' },
        include: { steps: true },
      });
      assertRevisionTransition(ctx.rev.status, 'cancelReview');
      if (!cycle) throw new Problem('INVALID_STATE_TRANSITION');
      const allowed =
        cycle.submittedById === user.id ||
        ctx.access.isProjectManager ||
        user.permissions.has('document.admin');
      if (!allowed) throw new Problem('FORBIDDEN');
      const res = await tx.documentRevision.updateMany({
        where: { id: revisionId, version: dto.version, status: 'IN_REVIEW' },
        data: { status: 'DRAFT', lockedAt: null, lastCycleOutcome: 'CANCELLED', ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.revisions.get(user, revisionId),
      );
      await tx.reviewCycle.update({
        where: { id: cycle.id },
        data: {
          status: 'CANCELLED',
          completedAt: this.clock.now(),
          cancelledReason: dto.reason,
          ...bumpVersion,
        },
      });
      for (const s of cycle.steps.filter((x) => x.status === 'PENDING' || x.status === 'ACTIVE')) {
        await tx.reviewStep.update({
          where: { id: s.id },
          data: { status: 'CANCELLED', ...bumpVersion },
        });
        await this.changes.touch(tx, Scope.user(s.assigneeId), 'ReviewStep', s.id);
      }
      await this.audit.record(tx, {
        action: 'document.revision.cancel_review',
        entityType: 'DocumentRevision',
        entityId: revisionId,
        projectId: ctx.doc.projectId,
        reason: dto.reason,
      });
      await this.touchRevision(tx, ctx.doc.projectId, ctx.doc.id, revisionId);
      await this.outbox.publish(
        tx,
        'review.cycle.cancelled',
        { cycleId: cycle.id, revisionId, projectId: ctx.doc.projectId },
        cycle.id,
      );
    });
    return this.revisions.get(user, revisionId);
  }

  // ───────────────────────── queries ─────────────────────────

  async cycle(user: AuthUser, cycleId: string): Promise<ReviewCycleDto> {
    const c = await this.prisma.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { revisionId: true },
    });
    if (!c) throw new Problem('NOT_FOUND');
    const ctx = await this.docAccess.revision(user, c.revisionId);
    const rev = await this.prisma.documentRevision.findUniqueOrThrow({
      where: { id: c.revisionId },
      include: revisionInclude,
    });
    return toCycleDto(
      rev.reviewCycles.find((x) => x.id === cycleId)!,
      user,
      ctx,
      this.clock.now(),
    );
  }

  /** Review inbox across projects (M04 §10 GET /review-steps). */
  async inbox(user: AuthUser, q: ReviewStepsQueryDto): Promise<MyReviewStepDto[]> {
    let assigneeId = user.id;
    if (q.assigneeId && q.assigneeId !== 'me' && q.assigneeId !== user.id) {
      if (!user.permissions.has('document.admin')) throw new Problem('FORBIDDEN');
      assigneeId = q.assigneeId;
    }
    const statuses = (csv(q.status) ?? ['ACTIVE']) as MyReviewStepDto['status'][];
    const rows = await this.prisma.reviewStep.findMany({
      where: {
        assigneeId,
        status: { in: statuses },
        ...(q.projectId ? { cycle: { revision: { document: { projectId: q.projectId } } } } : {}),
      },
      include: {
        cycle: {
          include: {
            submittedBy: { select: { id: true, displayNameTh: true } },
            revision: {
              include: {
                document: {
                  include: { project: { select: { id: true, code: true, name: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 200,
    });
    const now = this.clock.now();
    return rows
      .filter((s) => !s.cycle.revision.document.deletedAt)
      .map((s) => ({
        id: s.id,
        cycleId: s.cycleId,
        kind: s.kind,
        name: s.name,
        status: s.status,
        activatedAt: iso(s.activatedAt),
        dueAt: iso(s.dueAt),
        isOverdue: s.status === 'ACTIVE' && !!s.dueAt && s.dueAt < now,
        requiresSignature: s.requiresSignature,
        revisionId: s.cycle.revisionId,
        revLabel: s.cycle.revision.revLabel,
        purposeCode: s.cycle.revision.purposeCode,
        documentId: s.cycle.revision.documentId,
        documentNumber: s.cycle.revision.document.number,
        documentTitle: s.cycle.revision.document.title,
        projectId: s.cycle.revision.document.project.id,
        projectCode: s.cycle.revision.document.project.code,
        projectName: s.cycle.revision.document.project.name,
        submittedBy: { id: s.cycle.submittedBy.id, displayName: s.cycle.submittedBy.displayNameTh },
        version: s.version,
      }));
  }
}
