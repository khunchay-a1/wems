import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { ProjectRole, ProjectStatus, ProjectType } from '../../generated/prisma/enums';
import { AuditService, diffFields } from '../../common/audit/audit.service';
import { ChangeLogService, Scope } from '../../common/audit/change-log.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { ProjectAccessService, type ProjectAccess } from '../../common/auth/project-access.service';
import { Problem } from '../../common/errors/problem';
import { csv, pageArgs, parseSort, type Page } from '../../common/http/pagination';
import { IdGenerator } from '../../common/ids/id-generator';
import { NumberingService, projectScope } from '../../common/numbering/numbering.service';
import { renderNumber, validatePattern } from '../../common/numbering/pattern';
import { OutboxService } from '../../common/outbox/outbox.service';
import {
  assertVersionedUpdate,
  bumpVersion,
  decimalToString,
  fromDateOnly,
  iso,
  notDeleted,
  toDateOnly,
  type Tx,
} from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { bangkokDate } from '../../common/time/business-calendar';
import { ClockService } from '../../common/time/clock';
import { ClientsService } from '../clients/clients.service';
import {
  assertTransition,
  canTransition,
  documentsEditable,
  PROJECT_ACTIONS,
  type ProjectAction,
  projectReadOnly,
  REASON_REQUIRED,
  transmittalsAllowed,
} from './domain/project-state-machine';
import type {
  AddMemberDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  MemberDto,
  OpenItemDto,
  ProjectActionDto,
  ProjectDto,
  ProjectNumberingDto,
  ProjectOverviewDto,
  PutProjectNumberingDto,
  UpdateMemberDto,
  UpdateProjectDto,
} from './dto/projects.dto';

const projectInclude = (_userId: string) =>
  ({
    client: { select: { id: true, code: true, nameTh: true } },
    site: { select: { id: true, code: true, name: true } },
    projectManager: { select: { id: true, displayNameTh: true } },
    members: { where: { removedAt: null }, select: { userId: true, role: true } },
  }) satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: ReturnType<typeof projectInclude> }>;

const SAMPLE_DOC_CTX = { discipline: 'PR', type: 'DWG' };

/** M03 projects and teams (BR-PRJ-001..021). */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly changes: ChangeLogService,
    private readonly outbox: OutboxService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
    private readonly access: ProjectAccessService,
    private readonly numbering: NumberingService,
    private readonly clients: ClientsService,
  ) {}

  // ───────────────────────── read ─────────────────────────

  async list(q: ListProjectsQueryDto, user: AuthUser): Promise<Page<ProjectDto>> {
    const { skip, take, page, pageSize } = pageArgs(q);
    const sort = parseSort(
      q.sort,
      ['code', 'name', 'status', 'updatedAt', 'plannedEndDate'] as const,
      [{ field: 'updatedAt', dir: 'desc' }],
    );
    const memberOfMine = { members: { some: { userId: user.id, removedAt: null } } };
    const statuses = csv(q.status) as ProjectStatus[] | undefined;
    const types = csv(q.type) as ProjectType[] | undefined;
    const where: Prisma.ProjectWhereInput = {
      ...notDeleted,
      // AT-PRJ-04: without project.read_all only projects with an active membership are visible
      ...(q.mine || !user.permissions.has('project.read_all') ? memberOfMine : {}),
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(types?.length ? { type: { in: types } } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.q
        ? {
            OR: [
              { code: { contains: q.q, mode: 'insensitive' } },
              { name: { contains: q.q, mode: 'insensitive' } },
              { nameEn: { contains: q.q, mode: 'insensitive' } },
              { contractNo: { contains: q.q, mode: 'insensitive' } },
              { client: { nameTh: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: projectInclude(user.id),
        orderBy: sort.map((s) => ({ [s.field]: s.dir })),
        skip,
        take,
      }),
      this.prisma.project.count({ where }),
    ]);
    return { data: rows.map((r) => this.toDto(r, user)), meta: { page, pageSize, total } };
  }

  async get(id: string, user: AuthUser): Promise<ProjectDto> {
    await this.access.assertAccess(user, id);
    const row = await this.prisma.project.findUniqueOrThrow({
      where: { id },
      include: projectInclude(user.id),
    });
    const dto = this.toDto(row, user);
    // BR-PRJ-021: show why "close" is not possible yet
    if (dto.allowedActions.includes('close')) {
      const open = await this.openItems(this.prisma, id);
      if (open.length) {
        dto.allowedActions = dto.allowedActions.filter((a) => a !== 'close');
        dto.blockedActions.push({ action: 'close', code: 'PROJECT_HAS_OPEN_ITEMS' });
      }
    }
    return dto;
  }

  private toDto(p: ProjectRow, user: AuthUser): ProjectDto {
    const myRole = p.members.find((m) => m.userId === user.id)?.role ?? null;
    const isAdmin = user.roleCodes.includes('ADMIN');
    const isPm = myRole === 'PROJECT_MANAGER' || p.projectManagerId === user.id;
    const canManage = isPm || user.permissions.has('project.manage');
    const readOnly = projectReadOnly(p.status) && !isAdmin;
    const allowed: string[] = [];
    const blocked: { action: string; code: string }[] = [];
    if (canManage && !readOnly) allowed.push('edit', 'manageMembers', 'editNumbering');
    if (canManage) {
      for (const a of PROJECT_ACTIONS) {
        if (!canTransition(p.status, a)) continue;
        if (a === 'reopen' && !isAdmin) continue;
        allowed.push(a);
      }
    }
    if (user.permissions.has('document.create')) {
      if (documentsEditable(p.status)) allowed.push('createDocument');
      else blocked.push({ action: 'createDocument', code: 'DOC_PROJECT_NOT_EDITABLE' });
    }
    if (user.permissions.has('transmittal.manage')) {
      if (transmittalsAllowed(p.status)) allowed.push('createTransmittal');
      else blocked.push({ action: 'createTransmittal', code: 'PROJECT_READ_ONLY' });
    }
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      nameEn: p.nameEn,
      description: p.description,
      client: p.client,
      site: p.site,
      type: p.type,
      status: p.status,
      contractNo: p.contractNo,
      contractValue: decimalToString(p.contractValue),
      currency: p.currency,
      plannedStartDate: toDateOnly(p.plannedStartDate),
      plannedEndDate: toDateOnly(p.plannedEndDate),
      actualStartDate: toDateOnly(p.actualStartDate),
      actualEndDate: toDateOnly(p.actualEndDate),
      projectManager: p.projectManager
        ? { id: p.projectManager.id, displayName: p.projectManager.displayNameTh }
        : null,
      revisionScheme: p.revisionScheme,
      requireSeparationOfDuties: p.requireSeparationOfDuties,
      closedAt: iso(p.closedAt),
      myRole,
      memberCount: p.members.length,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      version: p.version,
      allowedActions: allowed,
      blockedActions: blocked,
    };
  }

  /** Access + BR-PRJ-010 manage right + read-only check, for write use cases. */
  async assertManage(user: AuthUser, projectId: string, tx?: Tx): Promise<ProjectAccess> {
    const a = await this.access.assertAccess(user, projectId, undefined, tx);
    if (!a.canManage) throw new Problem('FORBIDDEN', { rule: 'BR-PRJ-010' });
    if (a.readOnly) throw new Problem('PROJECT_READ_ONLY', { rule: 'BR-PRJ-020' });
    return a;
  }

  // ───────────────────────── create / update ─────────────────────────

  private dateFields(dto: Partial<CreateProjectDto>) {
    const out: Record<string, Date | null> = {};
    for (const k of [
      'plannedStartDate',
      'plannedEndDate',
      'actualStartDate',
      'actualEndDate',
    ] as const) {
      if (dto[k] !== undefined) out[k] = fromDateOnly(dto[k]);
    }
    return out;
  }

  private assertDateOrder(
    start: Date | null | undefined,
    end: Date | null | undefined,
    field: string,
  ): void {
    if (start && end && end < start) {
      throw new Problem('VALIDATION_FAILED', { errors: [{ field, code: 'END_BEFORE_START' }] });
    }
  }

  private async assertActiveUser(tx: Tx, userId: string, field = 'userId'): Promise<void> {
    const u = await tx.user.findFirst({ where: { id: userId, isActive: true, ...notDeleted } });
    if (!u) throw new Problem('VALIDATION_FAILED', { errors: [{ field, code: 'NOT_FOUND' }] });
  }

  /** BR-PRJ-002: the project manager is always an active PROJECT_MANAGER member. */
  private async ensurePmMember(
    tx: Tx,
    projectId: string,
    userId: string,
    actorId: string,
  ): Promise<void> {
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: { role: 'PROJECT_MANAGER', removedAt: null },
      create: {
        projectId,
        userId,
        role: 'PROJECT_MANAGER',
        addedById: actorId,
        addedAt: this.clock.now(),
      },
    });
    await this.changes.touch(tx, Scope.project(projectId), 'ProjectMember', userId);
  }

  async create(dto: CreateProjectDto, user: AuthUser): Promise<ProjectDto> {
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      await this.clients.assertSelectable(tx, dto.clientId, dto.siteId);
      const client = await tx.client.findUniqueOrThrow({ where: { id: dto.clientId } });
      const pmId = dto.projectManagerId ?? user.id;
      if (dto.projectManagerId) await this.assertActiveUser(tx, pmId, 'projectManagerId');
      const dates = this.dateFields(dto);
      this.assertDateOrder(dates.plannedStartDate, dates.plannedEndDate, 'plannedEndDate');
      // BR-PRJ-001: code from the PROJECT numbering scheme
      const code = await this.numbering.next(
        tx,
        'PROJECT',
        { client: client.code },
        {
          exists: async (n) =>
            !!(await tx.project.findUnique({ where: { code: n }, select: { id: true } })),
        },
      );
      const { clientId, siteId, projectManagerId: _pm, contractValue, ...rest } = dto;
      await tx.project.create({
        data: {
          ...rest,
          ...dates,
          id,
          code,
          clientId,
          siteId: siteId ?? null,
          contractValue: contractValue ? new Prisma.Decimal(contractValue) : null,
          projectManagerId: pmId,
          createdById: user.id,
        },
      });
      await this.ensurePmMember(tx, id, pmId, user.id);
      // BR-PRJ-002: the creator is a PM member unless someone else was named
      await this.audit.record(tx, {
        action: 'project.create',
        entityType: 'Project',
        entityId: id,
        projectId: id,
        summary: `${code} ${dto.name}`,
      });
      await this.changes.touch(tx, Scope.project(id), 'Project', id);
      if (pmId !== user.id) {
        await this.outbox.publish(
          tx,
          'project.member_added',
          { projectId: id, userId: pmId, role: 'PROJECT_MANAGER' },
          id,
        );
      }
    });
    return this.get(id, user);
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthUser): Promise<ProjectDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertManage(user, id, tx);
      const before = await tx.project.findUniqueOrThrow({ where: { id } });
      if (dto.code !== undefined && dto.code !== before.code) {
        // BR-PRJ-001: project.manage only, and only before the project has documents
        if (!user.permissions.has('project.manage'))
          throw new Problem('FORBIDDEN', { rule: 'BR-PRJ-001' });
        if (await tx.document.count({ where: { projectId: id } })) {
          throw new Problem('PROJECT_CODE_LOCKED', { rule: 'BR-PRJ-001' });
        }
        if (await tx.project.findUnique({ where: { code: dto.code }, select: { id: true } })) {
          throw new Problem('DUPLICATE', { errors: [{ field: 'code', code: 'DUPLICATE' }] });
        }
      }
      if (dto.revisionScheme !== undefined && dto.revisionScheme !== before.revisionScheme) {
        // BR-PRJ-004
        const revs = await tx.documentRevision.count({ where: { document: { projectId: id } } });
        if (revs) throw new Problem('PROJECT_SCHEME_LOCKED', { rule: 'BR-PRJ-004' });
      }
      if (dto.siteId) await this.clients.assertSelectable(tx, before.clientId, dto.siteId);
      if (dto.projectManagerId)
        await this.assertActiveUser(tx, dto.projectManagerId, 'projectManagerId');
      const dates = this.dateFields(dto);
      this.assertDateOrder(
        dates.plannedStartDate === undefined ? before.plannedStartDate : dates.plannedStartDate,
        dates.plannedEndDate === undefined ? before.plannedEndDate : dates.plannedEndDate,
        'plannedEndDate',
      );
      const { version, contractValue, ...rest } = dto;
      const data: Prisma.ProjectUncheckedUpdateManyInput = {
        ...rest,
        ...dates,
        ...(contractValue !== undefined
          ? { contractValue: contractValue === null ? null : new Prisma.Decimal(contractValue) }
          : {}),
      };
      const res = await tx.project.updateMany({
        where: { id, version, ...notDeleted },
        data: { ...data, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.get(id, user),
      );
      if (dto.projectManagerId && dto.projectManagerId !== before.projectManagerId) {
        await this.ensurePmMember(tx, id, dto.projectManagerId, user.id);
        if (dto.projectManagerId !== user.id) {
          await this.outbox.publish(
            tx,
            'project.member_added',
            { projectId: id, userId: dto.projectManagerId, role: 'PROJECT_MANAGER' },
            id,
          );
        }
      }
      await this.audit.record(tx, {
        action: 'project.update',
        entityType: 'Project',
        entityId: id,
        projectId: id,
        changes: diffFields(before, data),
      });
      await this.changes.touch(tx, Scope.project(id), 'Project', id);
    });
    return this.get(id, user);
  }

  // ───────────────────────── status actions ─────────────────────────

  /** BR-PRJ-021: review cycles in progress and draft transmittals block closing. */
  private async openItems(tx: Tx, projectId: string): Promise<OpenItemDto[]> {
    const [cycles, transmittals] = await Promise.all([
      tx.reviewCycle.findMany({
        where: { status: 'IN_PROGRESS', revision: { document: { projectId } } },
        select: {
          id: true,
          revision: { select: { revLabel: true, document: { select: { number: true } } } },
        },
        take: 50,
      }),
      tx.transmittal.findMany({
        where: { projectId, status: 'DRAFT' },
        select: { id: true, number: true },
        take: 50,
      }),
    ]);
    return [
      ...cycles.map((c) => ({
        kind: 'REVIEW_CYCLE',
        id: c.id,
        label: `${c.revision.document.number} Rev.${c.revision.revLabel}`,
      })),
      ...transmittals.map((t) => ({ kind: 'TRANSMITTAL', id: t.id, label: t.number })),
    ];
  }

  async act(
    id: string,
    action: ProjectAction,
    dto: ProjectActionDto,
    user: AuthUser,
  ): Promise<ProjectDto> {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.access.assertAccess(user, id, undefined, tx);
      if (!a.canManage) throw new Problem('FORBIDDEN', { rule: 'BR-PRJ-010' });
      if (action === 'reopen' && !user.roleCodes.includes('ADMIN')) {
        throw new Problem('FORBIDDEN', { rule: 'BR-PRJ-020' });
      }
      const p = a.project;
      const to = assertTransition(p.status, action);
      if (REASON_REQUIRED.has(action) && (!dto.reason || dto.reason.length < 3)) {
        throw new Problem('VALIDATION_FAILED', { errors: [{ field: 'reason', code: 'REQUIRED' }] });
      }
      if (action === 'close') {
        const open = await this.openItems(tx, id);
        if (open.length)
          throw new Problem('PROJECT_HAS_OPEN_ITEMS', {
            rule: 'BR-PRJ-021',
            extra: { items: open },
          });
      }
      const now = this.clock.now();
      const today = fromDateOnly(bangkokDate(now));
      const data: Prisma.ProjectUpdateManyMutationInput = {
        status: to,
        ...(action === 'start' && !p.actualStartDate ? { actualStartDate: today } : {}),
        ...(action === 'complete' && !p.actualEndDate ? { actualEndDate: today } : {}),
        ...(action === 'close' ? { closedAt: now } : {}),
        ...(action === 'reopen' ? { closedAt: null } : {}),
      };
      const res = await tx.project.updateMany({
        where: { id, version: dto.version, status: p.status, ...notDeleted },
        data: { ...data, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.get(id, user),
      );
      await this.audit.record(tx, {
        action: `project.${action}`,
        entityType: 'Project',
        entityId: id,
        projectId: id,
        changes: { before: { status: p.status }, after: { status: to } },
        reason: dto.reason ?? null,
      });
      await this.changes.touch(tx, Scope.project(id), 'Project', id);
      await this.outbox.publish(
        tx,
        'project.status_changed',
        { projectId: id, from: p.status, to },
        id,
      );
    });
    return this.get(id, user);
  }

  // ───────────────────────── members ─────────────────────────

  async members(projectId: string, user: AuthUser): Promise<MemberDto[]> {
    const a = await this.access.assertAccess(user, projectId);
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId, removedAt: null },
      include: {
        user: {
          select: { displayNameTh: true, displayNameEn: true, position: true, isActive: true },
        },
      },
      orderBy: [{ role: 'asc' }, { addedAt: 'asc' }],
    });
    return rows.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayNameTh,
      displayNameEn: m.user.displayNameEn,
      position: m.user.position,
      role: m.role,
      addedAt: m.addedAt.toISOString(),
      isProjectManager: a.project.projectManagerId === m.userId,
      isActiveUser: m.user.isActive,
    }));
  }

  async addMember(projectId: string, dto: AddMemberDto, user: AuthUser): Promise<MemberDto[]> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertManage(user, projectId, tx);
      await this.assertActiveUser(tx, dto.userId);
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: dto.userId } },
      });
      if (existing && !existing.removedAt) {
        throw new Problem('DUPLICATE', { errors: [{ field: 'userId', code: 'ALREADY_MEMBER' }] });
      }
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: dto.userId } },
        update: { role: dto.role, removedAt: null, addedById: user.id, addedAt: this.clock.now() },
        create: {
          projectId,
          userId: dto.userId,
          role: dto.role,
          addedById: user.id,
          addedAt: this.clock.now(),
        },
      });
      await this.audit.record(tx, {
        action: 'project.member.add',
        entityType: 'ProjectMember',
        entityId: dto.userId,
        projectId,
        changes: { before: {}, after: { userId: dto.userId, role: dto.role } },
      });
      await this.changes.touch(tx, Scope.project(projectId), 'ProjectMember', dto.userId);
      await this.outbox.publish(
        tx,
        'project.member_added',
        { projectId, userId: dto.userId, role: dto.role },
        projectId,
      );
    });
    return this.members(projectId, user);
  }

  async updateMember(
    projectId: string,
    userId: string,
    dto: UpdateMemberDto,
    user: AuthUser,
  ): Promise<MemberDto[]> {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.assertManage(user, projectId, tx);
      const m = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!m || m.removedAt) throw new Problem('NOT_FOUND');
      if (a.project.projectManagerId === userId && dto.role !== 'PROJECT_MANAGER') {
        throw new Problem('PROJECT_MANAGER_REQUIRED', { rule: 'BR-PRJ-002' });
      }
      await tx.projectMember.update({
        where: { projectId_userId: { projectId, userId } },
        data: { role: dto.role },
      });
      await this.audit.record(tx, {
        action: 'project.member.update',
        entityType: 'ProjectMember',
        entityId: userId,
        projectId,
        changes: { before: { role: m.role }, after: { role: dto.role } },
      });
      await this.changes.touch(tx, Scope.project(projectId), 'ProjectMember', userId);
    });
    return this.members(projectId, user);
  }

  async removeMember(projectId: string, userId: string, user: AuthUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.assertManage(user, projectId, tx);
      const m = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!m || m.removedAt) throw new Problem('NOT_FOUND');
      if (a.project.projectManagerId === userId) {
        throw new Problem('PROJECT_MANAGER_REQUIRED', { rule: 'BR-PRJ-002' });
      }
      // BR-PRJ-003 / AT-PRJ-02
      const pending = await tx.reviewStep.count({
        where: {
          assigneeId: userId,
          status: { in: ['ACTIVE', 'PENDING'] },
          cycle: { status: 'IN_PROGRESS', revision: { document: { projectId } } },
        },
      });
      if (pending)
        throw new Problem('MEMBER_HAS_PENDING_REVIEWS', {
          rule: 'BR-PRJ-003',
          extra: { pendingSteps: pending },
        });
      await tx.projectMember.update({
        where: { projectId_userId: { projectId, userId } },
        data: { removedAt: this.clock.now() },
      });
      await this.audit.record(tx, {
        action: 'project.member.remove',
        entityType: 'ProjectMember',
        entityId: userId,
        projectId,
        changes: { before: { role: m.role }, after: {} },
      });
      await this.changes.touch(tx, Scope.project(projectId), 'ProjectMember', userId, 'DELETE');
    });
  }

  /** Active members with one of the roles (used by M04 eligibility checks). */
  async memberRoles(tx: Tx, projectId: string, userId: string): Promise<ProjectRole | null> {
    const m = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return m && !m.removedAt ? m.role : null;
  }

  // ───────────────────────── overview ─────────────────────────

  async overview(projectId: string, user: AuthUser): Promise<ProjectOverviewDto> {
    await this.access.assertAccess(user, projectId);
    const now = this.clock.now();
    const docWhere = { projectId, ...notDeleted };
    const [byStatus, byRev, noRev, active, overdue, drafts, recent] = await Promise.all([
      this.prisma.document.groupBy({ by: ['status'], where: docWhere, _count: { _all: true } }),
      this.prisma.$queryRaw<{ status: string; count: bigint }[]>`
        SELECT r.status::text AS status, COUNT(*) AS count
        FROM documents d JOIN document_revisions r ON r.id = d.current_revision_id
        WHERE d.project_id = ${projectId}::uuid AND d.deleted_at IS NULL AND d.status = 'ACTIVE'
        GROUP BY r.status`,
      this.prisma.document.count({
        where: { ...docWhere, status: 'ACTIVE', currentRevisionId: null },
      }),
      this.prisma.reviewStep.count({
        where: {
          status: 'ACTIVE',
          cycle: { status: 'IN_PROGRESS', revision: { document: { projectId } } },
        },
      }),
      this.prisma.reviewStep.count({
        where: {
          status: 'ACTIVE',
          dueAt: { lt: now },
          cycle: { status: 'IN_PROGRESS', revision: { document: { projectId } } },
        },
      }),
      this.prisma.transmittal.count({ where: { projectId, status: 'DRAFT' } }),
      this.prisma.transmittal.findMany({
        where: { projectId, status: { not: 'CANCELLED' } },
        orderBy: [{ sentAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: 5,
        select: { id: true, number: true, subject: true, status: true, sentAt: true },
      }),
    ]);
    const documentsByRevisionStatus = byRev.map((r) => ({
      status: r.status,
      count: Number(r.count),
    }));
    if (noRev) documentsByRevisionStatus.push({ status: 'NO_REVISION', count: noRev });
    return {
      documentCount: byStatus.reduce((s, r) => s + r._count._all, 0),
      documentsByStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      documentsByRevisionStatus,
      activeReviewSteps: active,
      overdueReviewSteps: overdue,
      draftTransmittals: drafts,
      recentTransmittals: recent.map((t) => ({ ...t, sentAt: iso(t.sentAt) })),
    };
  }

  // ───────────────────────── numbering ─────────────────────────

  async getNumbering(projectId: string, user: AuthUser): Promise<ProjectNumberingDto> {
    const a = await this.access.assertAccess(user, projectId);
    const [own, global, client] = await Promise.all([
      this.prisma.numberingScheme.findUnique({
        where: { entity_scope: { entity: 'DOCUMENT', scope: projectScope(projectId) } },
      }),
      this.prisma.numberingScheme.findUniqueOrThrow({
        where: { entity_scope: { entity: 'DOCUMENT', scope: 'GLOBAL' } },
      }),
      this.prisma.client.findUniqueOrThrow({
        where: { id: a.project.clientId },
        select: { code: true },
      }),
    ]);
    const active = own?.isActive ? own : global;
    return {
      pattern: active.pattern,
      resetPolicy: active.resetPolicy,
      isOverride: !!own?.isActive,
      globalPattern: global.pattern,
      example: renderNumber(
        active.pattern,
        { ...SAMPLE_DOC_CTX, project: a.project.code, client: client.code },
        1,
        this.clock.now(),
      ),
    };
  }

  async putNumbering(
    projectId: string,
    dto: PutProjectNumberingDto,
    user: AuthUser,
  ): Promise<ProjectNumberingDto> {
    if (dto.pattern) {
      const err = validatePattern(dto.pattern);
      if (err)
        throw new Problem('NUMBERING_PATTERN_INVALID', {
          errors: [{ field: 'pattern', code: err }],
        });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.assertManage(user, projectId, tx);
      const scope = projectScope(projectId);
      const before = await tx.numberingScheme.findUnique({
        where: { entity_scope: { entity: 'DOCUMENT', scope } },
      });
      if (dto.pattern) {
        await tx.numberingScheme.upsert({
          where: { entity_scope: { entity: 'DOCUMENT', scope } },
          update: { pattern: dto.pattern, isActive: true },
          create: {
            id: this.ids.next(),
            entity: 'DOCUMENT',
            scope,
            pattern: dto.pattern,
            resetPolicy: 'NEVER',
          },
        });
      } else if (before) {
        await tx.numberingScheme.update({ where: { id: before.id }, data: { isActive: false } });
      }
      await this.audit.record(tx, {
        action: 'project.numbering.update',
        entityType: 'NumberingScheme',
        entityId: before?.id ?? null,
        projectId,
        changes: {
          before: { pattern: before?.isActive ? before.pattern : null },
          after: { pattern: dto.pattern },
        },
      });
    });
    return this.getNumbering(projectId, user);
  }
}
