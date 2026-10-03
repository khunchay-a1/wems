import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Prisma, PurposeCode } from '../../generated/prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ProjectAccessService } from '../../common/auth/project-access.service';
import { Problem } from '../../common/errors/problem';
import { enumLabel } from '../../common/i18n/enum-labels';
import type { Locale } from '../../common/i18n/locale';
import { PdfService } from '../../common/pdf/pdf.service';
import { iso, notDeleted, toDateOnly } from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { bangkokDate, buddhistYear } from '../../common/time/business-calendar';
import { ClockService } from '../../common/time/clock';
import { DocumentAccessService } from './document-access.service';
import type { XlsxFile } from './documents-excel.service';
import type { MyReviewStepDto } from './dto/revisions.dto';
import type {
  DocumentStatsDto,
  MyWorkDto,
  SearchResultDto,
  WorkRevisionDto,
} from './dto/workspace.dto';
import { ReviewService } from './review.service';

const PLAN_PURPOSES: PurposeCode[] = ['FR', 'FA', 'FT', 'FC'];
const DAY = 86_400_000;

/** "My work", global search, project document statistics and the MDL report (M04 §9, 07-web-ui §6.1). */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectAccessService,
    private readonly docAccess: DocumentAccessService,
    private readonly review: ReviewService,
    private readonly pdf: PdfService,
    private readonly clock: ClockService,
  ) {}

  private async visibleProjectFilter(user: AuthUser): Promise<Prisma.ProjectWhereInput> {
    const ids = await this.projects.visibleProjectIds(user);
    return ids === 'ALL' ? notDeleted : { id: { in: ids }, ...notDeleted };
  }

  // ───────────────────────── my work ─────────────────────────

  async myWork(user: AuthUser): Promise<MyWorkDto> {
    const steps: MyReviewStepDto[] = await this.review.inbox(user, {});
    const project = await this.visibleProjectFilter(user);
    const mine: Prisma.DocumentRevisionWhereInput = {
      OR: [{ preparedById: user.id }, { document: { ownerId: user.id } }],
      document: { ...notDeleted, project },
    };
    const myRevisions = await this.prisma.documentRevision.findMany({
      where: { ...mine, status: { in: ['DRAFT', 'IN_REVIEW'] } },
      select: { id: true },
    });
    const commentWhere: Prisma.CommentWhereInput = {
      ownerType: 'DOCUMENT_REVISION',
      ownerId: { in: myRevisions.map((r) => r.id) },
      parentId: null,
      status: 'OPEN',
      ...notDeleted,
    };
    const [comments, commentCount] = await Promise.all([
      this.prisma.comment.findMany({
        where: commentWhere,
        include: { author: { select: { displayNameTh: true } } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
      this.prisma.comment.count({ where: commentWhere }),
    ]);
    const revs = new Map(
      (
        await this.prisma.documentRevision.findMany({
          where: { id: { in: [...new Set(comments.map((c) => c.ownerId))] } },
          include: { document: { select: { id: true, projectId: true, number: true } } },
        })
      ).map((r) => [r.id, r]),
    );
    const returned = await this.prisma.documentRevision.findMany({
      where: { ...mine, status: 'DRAFT', lastCycleOutcome: 'REJECTED' },
      include: {
        document: { select: { id: true, projectId: true, number: true, title: true } },
        reviewCycles: { orderBy: { cycleNo: 'desc' }, take: 1, select: { completedAt: true } },
      },
      take: 10,
    });
    const clientReturns = await this.prisma.document.findMany({
      where: {
        ownerId: user.id,
        ...notDeleted,
        project,
        currentRevision: {
          status: { in: ['APPROVED', 'ISSUED'] },
          clientReturnCode: { in: ['CODE_3', 'CODE_4'] },
        },
      },
      include: { currentRevision: true },
      take: 10,
    });
    const now = this.clock.now();
    const toWork = (
      r: {
        id: string;
        revLabel: string;
        purposeCode: PurposeCode;
        clientReturnCode: WorkRevisionDto['clientReturnCode'];
      },
      d: { id: string; projectId: string; number: string; title: string },
      at: Date | null,
    ): WorkRevisionDto => ({
      revisionId: r.id,
      documentId: d.id,
      projectId: d.projectId,
      documentNumber: d.number,
      documentTitle: d.title,
      revLabel: r.revLabel,
      purposeCode: r.purposeCode,
      clientReturnCode: r.clientReturnCode,
      at: iso(at),
    });
    return {
      reviews: steps.slice(0, 5),
      reviewCount: steps.length,
      overdueReviewCount: steps.filter((s) => s.dueAt && new Date(s.dueAt) < now).length,
      commentsToAnswer: comments
        .filter((c) => revs.has(c.ownerId))
        .map((c) => {
          const r = revs.get(c.ownerId)!;
          return {
            commentId: c.id,
            revisionId: r.id,
            documentId: r.document.id,
            projectId: r.document.projectId,
            documentNumber: r.document.number,
            revLabel: r.revLabel,
            body: c.body,
            authorName: c.author.displayNameTh,
            createdAt: c.createdAt.toISOString(),
          };
        }),
      commentsToAnswerCount: commentCount,
      returned: returned.map((r) => toWork(r, r.document, r.reviewCycles[0]?.completedAt ?? null)),
      clientReturns: clientReturns.map((d) =>
        toWork(d.currentRevision!, d, d.currentRevision!.clientReturnedAt),
      ),
    };
  }

  // ───────────────────────── search ─────────────────────────

  /** Documents, projects and clients the user may see, at most 10 each (M04 §10). */
  async search(user: AuthUser, q: string): Promise<SearchResultDto> {
    const project = await this.visibleProjectFilter(user);
    const like = { contains: q, mode: 'insensitive' as const };
    const [documents, projects, clients] = await Promise.all([
      user.permissions.has('document.read')
        ? this.prisma.document.findMany({
            where: {
              ...notDeleted,
              project,
              OR: [
                { number: like },
                { title: like },
                { titleEn: like },
                { externalNumber: like },
                { tags: { has: q } },
              ],
            },
            include: {
              project: { select: { code: true } },
              currentRevision: { select: { revLabel: true } },
            },
            orderBy: { number: 'asc' },
            take: 10,
          })
        : Promise.resolve([]),
      this.prisma.project.findMany({
        where: {
          ...project,
          OR: [{ code: like }, { name: like }, { nameEn: like }, { contractNo: like }],
        },
        include: { client: { select: { nameTh: true } } },
        orderBy: { code: 'desc' },
        take: 10,
      }),
      user.permissions.has('client.read')
        ? this.prisma.client.findMany({
            where: {
              ...notDeleted,
              OR: [{ code: like }, { nameTh: like }, { nameEn: like }, { taxId: like }],
            },
            orderBy: { code: 'asc' },
            take: 10,
          })
        : Promise.resolve([]),
    ]);
    return {
      documents: documents.map((d) => ({
        id: d.id,
        projectId: d.projectId,
        projectCode: d.project.code,
        number: d.number,
        title: d.title,
        status: d.status,
        currentRevLabel: d.currentRevision?.revLabel ?? null,
      })),
      projects: projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        clientName: p.client.nameTh,
      })),
      clients: clients.map((c) => ({ id: c.id, code: c.code, nameTh: c.nameTh, nameEn: c.nameEn })),
    };
  }

  // ───────────────────────── statistics ─────────────────────────

  async stats(user: AuthUser, projectId: string): Promise<DocumentStatsDto> {
    await this.docAccess.project(user, projectId);
    const docs = await this.prisma.document.findMany({
      where: { projectId, ...notDeleted, status: { not: 'CANCELLED' } },
      select: {
        id: true,
        currentRevision: { select: { id: true, status: true, clientReturnCode: true } },
        plans: true,
      },
    });
    const byRevisionStatus: Record<string, number> = {};
    for (const d of docs) {
      const k = d.currentRevision?.status ?? 'NO_REVISION';
      byRevisionStatus[k] = (byRevisionStatus[k] ?? 0) + 1;
    }
    const now = this.clock.now();
    const stepWhere: Prisma.ReviewStepWhereInput = {
      status: 'ACTIVE',
      cycle: { revision: { document: { projectId, ...notDeleted } } },
    };
    const [activeReviews, overdueReviews, openComments] = await Promise.all([
      this.prisma.reviewStep.count({ where: stepWhere }),
      this.prisma.reviewStep.count({ where: { ...stepWhere, dueAt: { lt: now } } }),
      this.prisma.comment.count({
        where: {
          ownerType: 'DOCUMENT_REVISION',
          ownerId: { in: docs.map((d) => d.currentRevision?.id).filter((x): x is string => !!x) },
          parentId: null,
          status: { in: ['OPEN', 'RESPONDED'] },
          ...notDeleted,
        },
      }),
    ]);
    const monthly = new Map<string, { planned: number; actual: number }>();
    const bump = (d: Date | null, k: 'planned' | 'actual') => {
      if (!d) return;
      const m = toDateOnly(d)!.slice(0, 7);
      const v = monthly.get(m) ?? { planned: 0, actual: 0 };
      v[k] += 1;
      monthly.set(m, v);
    };
    for (const d of docs) {
      for (const p of d.plans) {
        bump(p.plannedDate, 'planned');
        bump(p.actualDate, 'actual');
      }
    }
    return {
      documentCount: docs.length,
      byRevisionStatus,
      activeReviews,
      overdueReviews,
      openComments,
      needsNewRevision: docs.filter(
        (d) =>
          (d.currentRevision?.status === 'APPROVED' || d.currentRevision?.status === 'ISSUED') &&
          (d.currentRevision.clientReturnCode === 'CODE_3' ||
            d.currentRevision.clientReturnCode === 'CODE_4'),
      ).length,
      monthly: [...monthly.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, ...v })),
    };
  }

  // ───────────────────────── MDL report ─────────────────────────

  /**
   * Master document list (M04 §9): number, title, discipline, type, current rev/status, approved
   * rev, latest client return, plan/forecast/actual per purpose and delay in days.
   */
  async mdl(user: AuthUser, projectId: string, format: 'xlsx' | 'pdf'): Promise<XlsxFile> {
    const access = await this.docAccess.project(user, projectId);
    if (!user.permissions.has('report.export')) throw new Problem('FORBIDDEN');
    const l: Locale = user.locale === 'en' ? 'en' : 'th';
    const H = (th: string, en: string) => (l === 'en' ? en : th);
    const today = bangkokDate(this.clock.now());
    const date = (d: Date | null | undefined) => {
      const s = toDateOnly(d);
      if (!s) return '';
      const [y, m, day] = s.split('-');
      return `${day}/${m}/${l === 'en' ? y : buddhistYear(Number(y))}`;
    };
    const docs = await this.prisma.document.findMany({
      where: { projectId, ...notDeleted },
      include: {
        discipline: { select: { code: true } },
        documentType: { select: { code: true } },
        currentRevision: true,
        latestApprovedRevision: true,
        plans: true,
      },
      orderBy: { number: 'asc' },
      take: 20_000,
    });
    const delayOf = (
      p:
        | { plannedDate: Date | null; forecastDate: Date | null; actualDate: Date | null }
        | undefined,
    ) => {
      if (!p?.plannedDate) return null;
      const planned = toDateOnly(p.plannedDate)!;
      const end = toDateOnly(p.actualDate) ?? (today > planned ? today : null);
      if (!end) return null;
      return Math.round((Date.parse(end) - Date.parse(planned)) / DAY);
    };
    const rows = docs.map((d) => {
      const plans = Object.fromEntries(
        PLAN_PURPOSES.map((pc) => [pc, d.plans.find((p) => p.purposeCode === pc)]),
      );
      const delays = PLAN_PURPOSES.map((pc) => delayOf(plans[pc])).filter(
        (x): x is number => x !== null,
      );
      return {
        number: d.number,
        title: d.title,
        discipline: d.discipline.code,
        type: d.documentType.code,
        rev: d.currentRevision ? `${d.currentRevision.revLabel}` : '',
        revStatus: enumLabel('RevisionStatus', d.currentRevision?.status, l),
        approved: d.latestApprovedRevision
          ? `${d.latestApprovedRevision.revLabel} (${d.latestApprovedRevision.purposeCode})`
          : '',
        client: enumLabel('ClientReturnCode', d.latestApprovedRevision?.clientReturnCode, l),
        plans: PLAN_PURPOSES.map((pc) => ({
          planned: date(plans[pc]?.plannedDate),
          forecast: date(plans[pc]?.forecastDate),
          actual: date(plans[pc]?.actualDate),
        })),
        delay: delays.length ? Math.max(...delays) : null,
      };
    });
    const base = `MDL-${access.project.code}-${today}`;
    const headers = [
      H('เลขเอกสาร', 'Number'),
      H('ชื่อ', 'Title'),
      H('สาขา', 'Disc.'),
      H('ประเภท', 'Type'),
      H('Rev.', 'Rev.'),
      H('สถานะ', 'Status'),
      H('ฉบับใช้งาน', 'Approved'),
      H('ผลลูกค้า', 'Client'),
    ];
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'WEMS';
      const ws = wb.addWorksheet('MDL');
      ws.addRow([
        `${H('ทะเบียนเอกสารหลัก (MDL)', 'Master document list (MDL)')} — ${access.project.code} ${access.project.name}`,
      ]).font = { bold: true, size: 13 };
      ws.addRow([`${H('ข้อมูล ณ', 'As of')} ${date(this.clock.now())}`]);
      ws.addRow([]);
      const head = ws.addRow([
        ...headers,
        ...PLAN_PURPOSES.flatMap((pc) => [
          `${pc} ${H('แผน', 'plan')}`,
          `${pc} ${H('คาดการณ์', 'forecast')}`,
          `${pc} ${H('จริง', 'actual')}`,
        ]),
        H('ล่าช้า (วัน)', 'Delay (days)'),
      ]);
      head.font = { bold: true };
      for (const r of rows) {
        ws.addRow([
          r.number,
          r.title,
          r.discipline,
          r.type,
          r.rev,
          r.revStatus,
          r.approved,
          r.client,
          ...r.plans.flatMap((p) => [p.planned, p.forecast, p.actual]),
          r.delay ?? '',
        ]);
      }
      ws.getColumn(1).width = 26;
      ws.getColumn(2).width = 44;
      ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
      return {
        name: `${base}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Buffer.from(await wb.xlsx.writeBuffer()),
      };
    }
    const body = await this.pdf.render(
      'mdl',
      {
        title: H('ทะเบียนเอกสารหลัก (MDL)', 'Master document list (MDL)'),
        project: `${access.project.code} ${access.project.name}`,
        asOf: `${H('ข้อมูล ณ', 'As of')} ${date(this.clock.now())}`,
        headers,
        purposes: PLAN_PURPOSES,
        planLabel: H('แผน / จริง', 'plan / actual'),
        delayLabel: H('ล่าช้า (วัน)', 'Delay (d)'),
        rows: rows.map((r) => ({ ...r, late: (r.delay ?? 0) > 0 })),
      },
      { locale: l, landscape: true, footerLeft: base },
    );
    return { name: `${base}.pdf`, mimeType: 'application/pdf', body };
  }
}
