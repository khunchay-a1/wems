import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user';
import { ProjectAccessService } from '../../common/auth/project-access.service';
import { Problem } from '../../common/errors/problem';
import { iso, notDeleted } from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClockService } from '../../common/time/clock';
import type { MyReviewStepDto } from '../documents/dto/revisions.dto';
import {
  collapseChanges,
  cursorExpired,
  decodeCursor,
  encodeCursor,
  parseScope,
  type SyncCursor,
  type SyncScope,
} from './domain/sync-cursor';
import type {
  DocumentRevisionSyncDto,
  DocumentSyncDto,
  MasterItemSyncDto,
  ProjectMemberSyncDto,
  ProjectSyncDto,
  SyncChangeDto,
  SyncPullDto,
  SyncPullQueryDto,
} from './dto/sync.dto';

type Data = Record<string, unknown>;
/** Loads current payloads; a missing key (or null) means the entity left the scope → DELETE. */
type Loader = (ids: string[]) => Promise<Map<string, Data | null>>;
/** Snapshot pager: next `take` entity ids after `after`, ascending. */
type Pager = (after: string | null, take: number) => Promise<string[]>;

interface Kind {
  entityType: string;
  page: Pager;
  load: Loader;
}

const DEFAULT_LIMIT = 500;
const OPEN_STEP = { status: 'ACTIVE' as const, cycle: { status: 'IN_PROGRESS' as const } };

/**
 * Mobile pull sync (docs/08-mobile.md §5.1, ADR-0004): snapshot of a scope, then the change log.
 * Payloads are always loaded fresh, so the change log only carries ids.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectAccessService,
    private readonly clock: ClockService,
  ) {}

  async pull(user: AuthUser, q: SyncPullQueryDto): Promise<SyncPullDto> {
    const scope = parseScope(q.scope);
    if (!scope)
      throw new Problem('VALIDATION_FAILED', { errors: [{ field: 'scope', code: 'invalid' }] });
    const kinds = await this.kindsFor(user, scope);
    const now = this.clock.now();
    const limit = q.limit ?? DEFAULT_LIMIT;
    let cursor: SyncCursor | null = null;
    if (q.cursor) {
      cursor = decodeCursor(q.cursor);
      if (!cursor) {
        throw new Problem('VALIDATION_FAILED', { errors: [{ field: 'cursor', code: 'invalid' }] });
      }
      if (cursorExpired(cursor, now.getTime())) throw new Problem('SYNC_CURSOR_EXPIRED');
    }
    const result =
      !cursor || cursor.mode === 'snapshot'
        ? await this.snapshot(scope, kinds, cursor, limit, now.getTime())
        : await this.changes(scope, kinds, cursor.seq, limit, now.getTime());
    return { scope: scope.key, ...result, serverTime: now.toISOString() };
  }

  // ───────────── modes ─────────────

  private async snapshot(
    scope: SyncScope,
    kinds: Kind[],
    cursor: Extract<SyncCursor, { mode: 'snapshot' }> | null,
    limit: number,
    nowMs: number,
  ): Promise<Omit<SyncPullDto, 'scope' | 'serverTime'>> {
    const maxSeq = cursor?.maxSeq ?? (await this.maxSeq(scope.key));
    let k = cursor?.kind ?? 0;
    let after = cursor?.after ?? null;
    const changes: SyncChangeDto[] = [];
    while (k < kinds.length && changes.length < limit) {
      const kind = kinds[k]!;
      const take = limit - changes.length;
      const ids = await kind.page(after, take);
      const data = ids.length ? await kind.load(ids) : new Map<string, Data | null>();
      for (const id of ids) {
        const d = data.get(id);
        if (d) changes.push({ entityType: kind.entityType, op: 'UPSERT', id, data: d });
      }
      if (ids.length < take) {
        k += 1;
        after = null;
      } else {
        after = ids[ids.length - 1]!;
      }
    }
    if (k >= kinds.length) {
      // snapshot finished → continue from the change log recorded since it started
      const pending = await this.prisma.changeLog.count({
        where: { scopeKey: scope.key, seq: { gt: maxSeq } },
      });
      return {
        changes,
        nextCursor: encodeCursor({ mode: 'changes', seq: maxSeq, issuedAt: nowMs }),
        hasMore: pending > 0,
      };
    }
    return {
      changes,
      nextCursor: encodeCursor({ mode: 'snapshot', maxSeq, kind: k, after, issuedAt: nowMs }),
      hasMore: true,
    };
  }

  private async changes(
    scope: SyncScope,
    kinds: Kind[],
    since: bigint,
    limit: number,
    nowMs: number,
  ): Promise<Omit<SyncPullDto, 'scope' | 'serverTime'>> {
    const rows = await this.prisma.changeLog.findMany({
      where: { scopeKey: scope.key, seq: { gt: since } },
      orderBy: { seq: 'asc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const byType = new Map(kinds.map((x) => [x.entityType, x]));
    const collapsed = collapseChanges(page, new Set(byType.keys()));
    const loaded = new Map<string, Map<string, Data | null>>();
    for (const [type, kind] of byType) {
      const ids = collapsed
        .filter((c) => c.entityType === type && c.op === 'UPSERT')
        .map((c) => c.id);
      if (ids.length) loaded.set(type, await kind.load(ids));
    }
    const changes: SyncChangeDto[] = collapsed.map((c) => {
      const d = c.op === 'UPSERT' ? loaded.get(c.entityType)?.get(c.id) : null;
      return d
        ? { entityType: c.entityType, op: 'UPSERT', id: c.id, data: d }
        : { entityType: c.entityType, op: 'DELETE', id: c.id };
    });
    const last = page.length ? page[page.length - 1]!.seq : since;
    return {
      changes,
      nextCursor: encodeCursor({ mode: 'changes', seq: last, issuedAt: nowMs }),
      hasMore: rows.length > limit,
    };
  }

  private async maxSeq(scopeKey: string): Promise<bigint> {
    const r = await this.prisma.changeLog.aggregate({ where: { scopeKey }, _max: { seq: true } });
    return r._max.seq ?? 0n;
  }

  // ───────────── scopes ─────────────

  private async kindsFor(user: AuthUser, scope: SyncScope): Promise<Kind[]> {
    switch (scope.kind) {
      case 'global':
        return [this.discipline(), this.documentType()];
      case 'user':
        if (scope.id !== user.id) throw new Problem('SYNC_SCOPE_FORBIDDEN');
        return [this.reviewStep(user.id)];
      case 'project': {
        const access = await this.projects.resolve(user, scope.id);
        if (!access) throw new Problem('SYNC_SCOPE_FORBIDDEN');
        const base = [this.project(scope.id), this.member(scope.id)];
        return user.permissions.has('document.read')
          ? [...base, this.document(scope.id), this.revision(scope.id)]
          : base;
      }
    }
  }

  private project(projectId: string): Kind {
    return {
      entityType: 'Project',
      page: (after) => Promise.resolve(after ? [] : [projectId]),
      load: async (ids) => {
        const rows = await this.prisma.project.findMany({
          where: { id: { in: ids.filter((x) => x === projectId) }, ...notDeleted },
          include: { client: { select: { nameTh: true } }, site: { select: { name: true } } },
        });
        return new Map(
          rows.map((p): [string, Data] => [
            p.id,
            {
              id: p.id,
              code: p.code,
              name: p.name,
              nameEn: p.nameEn,
              type: p.type,
              status: p.status,
              clientName: p.client.nameTh,
              siteName: p.site?.name ?? null,
              projectManagerId: p.projectManagerId,
              plannedEndDate: p.plannedEndDate ? p.plannedEndDate.toISOString().slice(0, 10) : null,
              updatedAt: p.updatedAt.toISOString(),
              version: p.version,
            } satisfies ProjectSyncDto as unknown as Data,
          ]),
        );
      },
    };
  }

  private member(projectId: string): Kind {
    const where = { projectId, removedAt: null };
    return {
      entityType: 'ProjectMember',
      page: async (after, take) =>
        (
          await this.prisma.projectMember.findMany({
            where: { ...where, ...(after ? { userId: { gt: after } } : {}) },
            orderBy: { userId: 'asc' },
            take,
            select: { userId: true },
          })
        ).map((r) => r.userId),
      load: async (ids) => {
        const rows = await this.prisma.projectMember.findMany({
          where: { ...where, userId: { in: ids } },
          include: { user: { select: { displayNameTh: true } } },
        });
        return new Map(
          rows.map((m): [string, Data] => [
            m.userId,
            {
              projectId: m.projectId,
              userId: m.userId,
              role: m.role,
              displayName: m.user.displayNameTh,
            } satisfies ProjectMemberSyncDto as unknown as Data,
          ]),
        );
      },
    };
  }

  private document(projectId: string): Kind {
    const where = { projectId, ...notDeleted };
    return {
      entityType: 'Document',
      page: async (after, take) =>
        (
          await this.prisma.document.findMany({
            where: { ...where, ...(after ? { id: { gt: after } } : {}) },
            orderBy: { id: 'asc' },
            take,
            select: { id: true },
          })
        ).map((r) => r.id),
      load: async (ids) => {
        const rows = await this.prisma.document.findMany({
          where: { ...where, id: { in: ids } },
          include: { owner: { select: { displayNameTh: true } } },
        });
        return new Map(
          rows.map((d): [string, Data] => [
            d.id,
            {
              id: d.id,
              projectId: d.projectId,
              number: d.number,
              title: d.title,
              titleEn: d.titleEn,
              disciplineId: d.disciplineId,
              documentTypeId: d.documentTypeId,
              status: d.status,
              confidentiality: d.confidentiality,
              ownerName: d.owner?.displayNameTh ?? null,
              currentRevisionId: d.currentRevisionId,
              latestApprovedRevisionId: d.latestApprovedRevisionId,
              supersededByDocumentId: d.supersededByDocumentId,
              tags: d.tags,
              updatedAt: d.updatedAt.toISOString(),
              version: d.version,
            } satisfies DocumentSyncDto as unknown as Data,
          ]),
        );
      },
    };
  }

  private revision(projectId: string): Kind {
    const where = { document: { projectId, ...notDeleted } };
    return {
      entityType: 'DocumentRevision',
      page: async (after, take) =>
        (
          await this.prisma.documentRevision.findMany({
            where: { ...where, ...(after ? { id: { gt: after } } : {}) },
            orderBy: { id: 'asc' },
            take,
            select: { id: true },
          })
        ).map((r) => r.id),
      load: async (ids) => {
        const rows = await this.prisma.documentRevision.findMany({
          where: { ...where, id: { in: ids } },
          include: {
            preparedBy: { select: { displayNameTh: true } },
            approvedBy: { select: { displayNameTh: true } },
            files: {
              where: { isCurrent: true },
              include: { file: true },
              orderBy: { role: 'asc' },
            },
          },
        });
        return new Map(
          rows.map((r): [string, Data] => [
            r.id,
            {
              id: r.id,
              documentId: r.documentId,
              revLabel: r.revLabel,
              revIndex: r.revIndex,
              purposeCode: r.purposeCode,
              status: r.status,
              description: r.description,
              preparedByName: r.preparedBy.displayNameTh,
              approvedByName: r.approvedBy?.displayNameTh ?? null,
              approvedAt: iso(r.approvedAt),
              issuedAt: iso(r.issuedAt),
              lastCycleOutcome: r.lastCycleOutcome,
              clientReturnCode: r.clientReturnCode,
              files: r.files
                .filter((f) => !f.file.deletedAt)
                .map((f) => ({
                  id: f.id,
                  role: f.role,
                  fileId: f.fileId,
                  originalName: f.file.originalName,
                  mimeType: f.file.mimeType,
                  sizeBytes: Number(f.file.sizeBytes),
                  pageCount: f.file.pageCount,
                })),
              updatedAt: r.updatedAt.toISOString(),
              version: r.version,
            } satisfies DocumentRevisionSyncDto as unknown as Data,
          ]),
        );
      },
    };
  }

  /** My open review steps (scope user:<me>); a step that closes or moves away becomes DELETE. */
  private reviewStep(userId: string): Kind {
    const where = { assigneeId: userId, ...OPEN_STEP };
    return {
      entityType: 'ReviewStep',
      page: async (after, take) =>
        (
          await this.prisma.reviewStep.findMany({
            where: { ...where, ...(after ? { id: { gt: after } } : {}) },
            orderBy: { id: 'asc' },
            take,
            select: { id: true },
          })
        ).map((r) => r.id),
      load: async (ids) => {
        const now = this.clock.now();
        const rows = await this.prisma.reviewStep.findMany({
          where: { ...where, id: { in: ids } },
          include: {
            cycle: {
              include: {
                submittedBy: { select: { id: true, displayNameTh: true } },
                revision: {
                  include: {
                    document: { include: { project: { select: { code: true, name: true } } } },
                  },
                },
              },
            },
          },
        });
        return new Map(
          rows
            .filter((s) => !s.cycle.revision.document.deletedAt)
            .map((s): [string, Data] => {
              const rev = s.cycle.revision;
              return [
                s.id,
                {
                  id: s.id,
                  cycleId: s.cycleId,
                  kind: s.kind,
                  name: s.name,
                  status: s.status,
                  activatedAt: iso(s.activatedAt),
                  dueAt: iso(s.dueAt),
                  isOverdue: !!s.dueAt && s.dueAt < now,
                  requiresSignature: s.requiresSignature,
                  revisionId: rev.id,
                  revLabel: rev.revLabel,
                  purposeCode: rev.purposeCode,
                  documentId: rev.documentId,
                  documentNumber: rev.document.number,
                  documentTitle: rev.document.title,
                  projectId: rev.document.projectId,
                  projectCode: rev.document.project.code,
                  projectName: rev.document.project.name,
                  submittedBy: {
                    id: s.cycle.submittedBy.id,
                    displayName: s.cycle.submittedBy.displayNameTh,
                  },
                  version: s.version,
                } satisfies MyReviewStepDto,
              ];
            }),
        );
      },
    };
  }

  private discipline(): Kind {
    return this.master('Discipline', {
      page: (after, take) =>
        this.prisma.discipline.findMany({
          where: after ? { id: { gt: after } } : {},
          orderBy: { id: 'asc' },
          take,
        }),
      load: (ids) => this.prisma.discipline.findMany({ where: { id: { in: ids } } }),
    });
  }

  private documentType(): Kind {
    return this.master('DocumentType', {
      page: (after, take) =>
        this.prisma.documentType.findMany({
          where: after ? { id: { gt: after } } : {},
          orderBy: { id: 'asc' },
          take,
        }),
      load: (ids) => this.prisma.documentType.findMany({ where: { id: { in: ids } } }),
    });
  }

  private master(
    entityType: string,
    q: {
      page: (after: string | null, take: number) => Promise<{ id: string }[]>;
      load: (ids: string[]) => Promise<MasterItemSyncDto[]>;
    },
  ): Kind {
    return {
      entityType,
      page: async (after, take) => (await q.page(after, take)).map((r) => r.id),
      load: async (ids) =>
        new Map(
          (await q.load(ids)).map((m): [string, Data] => [
            m.id,
            {
              id: m.id,
              code: m.code,
              nameTh: m.nameTh,
              nameEn: m.nameEn,
              sortOrder: m.sortOrder,
              isActive: m.isActive,
            } satisfies MasterItemSyncDto as unknown as Data,
          ]),
        ),
    };
  }
}
