import type { PrismaClient } from '../../generated/prisma/client';
import { enumLabel } from '../../common/i18n/enum-labels';
import type { Locale } from '../../common/i18n/locale';
import { defineNotification, t } from '../../common/notifications/catalog';

type P = Record<string, unknown>;
const s = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';

async function revisionInfo(prisma: PrismaClient, revisionId: string) {
  return prisma.documentRevision.findUnique({
    where: { id: revisionId },
    include: {
      document: { select: { id: true, number: true, title: true, projectId: true, ownerId: true } },
    },
  });
}

async function stepInfo(prisma: PrismaClient, stepId: string) {
  return prisma.reviewStep.findUnique({
    where: { id: stepId },
    include: {
      cycle: {
        include: {
          revision: {
            include: {
              document: { select: { id: true, number: true, title: true, projectId: true } },
            },
          },
        },
      },
    },
  });
}

const docLink = (projectId: string, documentId: string, revisionId?: string) =>
  `/projects/${projectId}/documents/${documentId}${revisionId ? `?rev=${revisionId}` : ''}`;
const reviewLink = (projectId: string, documentId: string, revisionId: string) =>
  `/projects/${projectId}/documents/${documentId}/revisions/${revisionId}/review`;

async function projectRoleUsers(prisma: PrismaClient, projectId: string, roles: string[]) {
  const rows = await prisma.projectMember.findMany({
    where: { projectId, removedAt: null, role: { in: roles as never[] } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

function due(l: Locale, d: Date | null | undefined): string {
  if (!d) return '';
  return d.toLocaleString(l === 'en' ? 'en-GB' : 'th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** M04 notifications (docs/05-workflows.md §10). */
export function registerDocumentNotifications(): void {
  const stepRender =
    (kind: 'activated' | 'reassigned' | 'due_soon' | 'overdue') =>
    async (p: P, l: Locale, { prisma }: { prisma: PrismaClient }) => {
      const st = await stepInfo(prisma, s(p.stepId));
      const r = st?.cycle.revision;
      const label = r ? `${r.document.number} Rev.${r.revLabel}` : '';
      const titles = {
        activated: t(l, `งานตรวจใหม่: ${label}`, `New review task: ${label}`),
        reassigned: t(l, `มอบหมายงานตรวจ: ${label}`, `Review task reassigned: ${label}`),
        due_soon: t(l, `งานตรวจใกล้ครบกำหนด: ${label}`, `Review due soon: ${label}`),
        overdue: t(l, `งานตรวจเลยกำหนด: ${label}`, `Review overdue: ${label}`),
      };
      return {
        title: titles[kind],
        body: [
          r?.document.title ?? '',
          st ? `${st.name} · ${t(l, 'ครบกำหนด', 'due')} ${due(l, st.dueAt)}` : '',
        ]
          .filter(Boolean)
          .join(' — '),
        entityType: 'ReviewStep',
        entityId: s(p.stepId),
        projectId: r?.document.projectId,
        link: r ? reviewLink(r.document.projectId, r.document.id, r.id) : undefined,
      };
    };

  defineNotification('review.step.activated', {
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    mandatoryInApp: true,
    recipients: (p) => Promise.resolve([s(p.assigneeId)]),
    render: stepRender('activated'),
  });

  defineNotification('review.step.reassigned', {
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    recipients: (p) => Promise.resolve([s(p.assigneeId), s(p.previousAssigneeId)]),
    render: stepRender('reassigned'),
  });

  defineNotification('review.step.due_soon', {
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    recipients: (p) => Promise.resolve([s(p.assigneeId)]),
    render: stepRender('due_soon'),
  });

  // BR-DOC-038: overdue ≥ 2 working days also goes to the PM
  defineNotification('review.step.overdue', {
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    mandatoryInApp: true,
    notifyActor: true,
    recipients: async (p, { prisma }) => {
      const out = [s(p.assigneeId)];
      if (p.notifyPm) {
        const pm = await prisma.project.findUnique({
          where: { id: s(p.projectId) },
          select: { projectManagerId: true },
        });
        if (pm?.projectManagerId) out.push(pm.projectManagerId);
      }
      return out;
    },
    render: stepRender('overdue'),
  });

  defineNotification('revision.approved', {
    channels: ['IN_APP', 'PUSH'],
    recipients: async (p, { prisma }) => [
      s(p.preparedById),
      ...(p.ownerId ? [s(p.ownerId)] : []),
      ...(await projectRoleUsers(prisma, s(p.projectId), ['DOCUMENT_CONTROLLER'])),
    ],
    render: async (p, l, { prisma }) => {
      const r = await revisionInfo(prisma, s(p.revisionId));
      const label = r ? `${r.document.number} Rev.${r.revLabel}` : '';
      return {
        title: t(l, `อนุมัติแล้ว: ${label}`, `Approved: ${label}`),
        body: `${r?.document.title ?? ''} · ${enumLabel('PurposeCode', r?.purposeCode, l)}`,
        entityType: 'DocumentRevision',
        entityId: s(p.revisionId),
        projectId: s(p.projectId),
        link: r ? docLink(r.document.projectId, r.document.id, r.id) : undefined,
      };
    },
  });

  defineNotification('revision.rejected', {
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    recipients: (p) => Promise.resolve([s(p.preparedById), ...(p.ownerId ? [s(p.ownerId)] : [])]),
    render: async (p, l, { prisma }) => {
      const r = await revisionInfo(prisma, s(p.revisionId));
      const label = r ? `${r.document.number} Rev.${r.revLabel}` : '';
      return {
        title: t(l, `ถูกตีกลับ: ${label}`, `Returned for revision: ${label}`),
        body: t(
          l,
          `${r?.document.title ?? ''} — ตอบความเห็นและแก้ไขแล้วส่งตรวจใหม่`,
          `${r?.document.title ?? ''} — answer the comments, fix and resubmit`,
        ),
        entityType: 'DocumentRevision',
        entityId: s(p.revisionId),
        projectId: s(p.projectId),
        link: r ? reviewLink(r.document.projectId, r.document.id, r.id) : undefined,
      };
    },
  });

  // Offline pins live on the devices; the site team of the project gets the push (08-mobile §7)
  defineNotification('revision.superseded', {
    channels: ['PUSH'],
    recipients: (p, { prisma }) =>
      projectRoleUsers(prisma, s(p.projectId), ['SITE_ENGINEER', 'FOREMAN']),
    render: async (p, l, { prisma }) => {
      const r = await revisionInfo(prisma, s(p.revisionId));
      const by = await prisma.documentRevision.findUnique({
        where: { id: s(p.byRevisionId) },
        select: { revLabel: true },
      });
      const label = r ? `${r.document.number} Rev.${r.revLabel}` : '';
      return {
        title: t(l, `มีฉบับใหม่: ${label} ถูกแทนที่`, `New revision: ${label} is superseded`),
        body: t(
          l,
          `ใช้ Rev.${by?.revLabel ?? ''} แทน ห้ามใช้ฉบับเก่า`,
          `Use Rev.${by?.revLabel ?? ''} — do not use the old revision`,
        ),
        entityType: 'DocumentRevision',
        entityId: s(p.byRevisionId),
        projectId: s(p.projectId),
        link: r ? docLink(r.document.projectId, r.document.id, s(p.byRevisionId)) : undefined,
      };
    },
  });

  defineNotification('revision.voided', {
    channels: ['IN_APP'],
    recipients: async (p, { prisma }) => {
      const pm = await prisma.project.findUnique({
        where: { id: s(p.projectId) },
        select: { projectManagerId: true },
      });
      return pm?.projectManagerId ? [pm.projectManagerId] : [];
    },
    render: async (p, l, { prisma }) => {
      const r = await revisionInfo(prisma, s(p.revisionId));
      const label = r ? `${r.document.number} Rev.${r.revLabel}` : '';
      return {
        title: t(l, `ยกเลิก (VOID): ${label}`, `Voided: ${label}`),
        body: r?.voidReason ?? '',
        entityType: 'DocumentRevision',
        entityId: s(p.revisionId),
        projectId: s(p.projectId),
        link: r ? docLink(r.document.projectId, r.document.id, r.id) : undefined,
      };
    },
  });

  defineNotification('comment.created', {
    channels: ['IN_APP', 'PUSH'],
    recipients: (p) => Promise.resolve(((p.mentions as string[] | undefined) ?? []).map(String)),
    render: async (p, l, { prisma }) => {
      const r = p.revisionId ? await revisionInfo(prisma, s(p.revisionId)) : null;
      const label = r ? `${r.document.number} Rev.${r.revLabel}` : '';
      return {
        title: t(
          l,
          `มีผู้กล่าวถึงคุณในความเห็น ${label}`,
          `You were mentioned in a comment ${label}`,
        ),
        body: s(p.excerpt),
        entityType: 'Comment',
        entityId: s(p.commentId),
        projectId: p.projectId ? s(p.projectId) : undefined,
        link: r ? reviewLink(r.document.projectId, r.document.id, r.id) : undefined,
      };
    },
  });

  defineNotification('comment.responded', {
    channels: ['IN_APP'],
    recipients: (p) => Promise.resolve([s(p.authorId)]),
    render: async (p, l, { prisma }) => {
      const r = p.revisionId ? await revisionInfo(prisma, s(p.revisionId)) : null;
      const label = r ? `${r.document.number} Rev.${r.revLabel}` : '';
      return {
        title: t(l, `ผู้จัดทำตอบความเห็นของคุณ ${label}`, `Your comment was answered ${label}`),
        body: s(p.excerpt),
        entityType: 'Comment',
        entityId: s(p.commentId),
        projectId: p.projectId ? s(p.projectId) : undefined,
        link: r ? reviewLink(r.document.projectId, r.document.id, r.id) : undefined,
      };
    },
  });

  // BR-DOC-064: CODE_3/CODE_4 → document owner and PM; the register shows "new revision needed"
  defineNotification('transmittal.client_response_recorded', {
    channels: ['IN_APP', 'EMAIL', 'PUSH'],
    recipients: async (p, { prisma }) => {
      const doc = await prisma.document.findUnique({
        where: { id: s(p.documentId) },
        select: { ownerId: true, project: { select: { projectManagerId: true } } },
      });
      return [doc?.ownerId, doc?.project.projectManagerId].filter((x): x is string => !!x);
    },
    render: async (p, l, { prisma }) => {
      const r = await revisionInfo(prisma, s(p.revisionId));
      const label = r ? `${r.document.number} Rev.${r.revLabel}` : '';
      return {
        title: t(
          l,
          `ลูกค้าตอบกลับ ${enumLabel('ClientReturnCode', s(p.code), l)}: ${label}`,
          `Client returned ${enumLabel('ClientReturnCode', s(p.code), l)}: ${label}`,
        ),
        body: t(l, 'ต้องออก revision ใหม่', 'A new revision is needed'),
        entityType: 'DocumentRevision',
        entityId: s(p.revisionId),
        projectId: s(p.projectId),
        link: r ? docLink(r.document.projectId, r.document.id, r.id) : undefined,
      };
    },
  });
}
