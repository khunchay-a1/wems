import { enumLabel } from '../../common/i18n/enum-labels';
import { defineNotification, t } from '../../common/notifications/catalog';

/** M03 notifications (docs/05-workflows.md §10). */
export function registerProjectNotifications(): void {
  defineNotification('project.member_added', {
    channels: ['IN_APP', 'EMAIL'],
    recipients: (p) => Promise.resolve([String(p.userId)]),
    render: async (p, l, { prisma }) => {
      const project = await prisma.project.findUnique({
        where: { id: String(p.projectId) },
        select: { code: true, name: true },
      });
      const label = project ? `${project.code} ${project.name}` : '';
      return {
        title: t(l, `คุณถูกเพิ่มเข้าโครงการ ${label}`, `You were added to project ${label}`),
        body:
          t(l, 'บทบาทในโครงการ: ', 'Project role: ') + enumLabel('ProjectRole', String(p.role), l),
        entityType: 'Project',
        entityId: String(p.projectId),
        projectId: String(p.projectId),
        link: `/projects/${String(p.projectId)}`,
      };
    },
  });
}
