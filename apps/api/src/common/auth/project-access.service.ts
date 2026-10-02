import { Injectable } from '@nestjs/common';
import type { Project, ProjectRole } from '../../generated/prisma/client';
import { Problem } from '../errors/problem';
import { notDeleted, type Tx } from '../prisma/helpers';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth-user';
import type { Permission } from './permissions';

export interface ProjectAccess {
  project: Project;
  /** Active membership role, null when access comes from project.read_all */
  role: ProjectRole | null;
  isProjectManager: boolean;
  /** BR-PRJ-010: project.manage or PM of this project */
  canManage: boolean;
  /** CLOSED/CANCELLED projects are read-only except for ADMIN (docs/06-security.md §3.1) */
  readOnly: boolean;
}

/**
 * Project scope (docs/06-security.md §3.1):
 * hasPermission(action) AND (isActiveMember(project) OR hasPermission("project.read_all")).
 * Cannot see → 404; can see but lacks the permission → 403.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: AuthUser, projectId: string, tx?: Tx): Promise<ProjectAccess | null> {
    const db = tx ?? this.prisma;
    const project = await db.project.findFirst({ where: { id: projectId, ...notDeleted } });
    if (!project) return null;
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true, removedAt: true },
    });
    const activeRole = member && !member.removedAt ? member.role : null;
    if (!activeRole && !user.permissions.has('project.read_all')) return null;
    const isProjectManager =
      activeRole === 'PROJECT_MANAGER' || project.projectManagerId === user.id;
    return {
      project,
      role: activeRole,
      isProjectManager,
      canManage: isProjectManager || user.permissions.has('project.manage'),
      readOnly:
        (project.status === 'CLOSED' || project.status === 'CANCELLED') &&
        !user.roleCodes.includes('ADMIN'),
    };
  }

  async assertAccess(
    user: AuthUser,
    projectId: string,
    permission?: Permission,
    tx?: Tx,
  ): Promise<ProjectAccess> {
    const access = await this.resolve(user, projectId, tx);
    if (!access) throw new Problem('NOT_FOUND');
    if (permission && !user.permissions.has(permission)) throw new Problem('FORBIDDEN');
    return access;
  }

  /** Ids of projects the user can see — for cross-project lists (search, my reviews). */
  async visibleProjectIds(user: AuthUser): Promise<string[] | 'ALL'> {
    if (user.permissions.has('project.read_all')) return 'ALL';
    const rows = await this.prisma.projectMember.findMany({
      where: { userId: user.id, removedAt: null, project: notDeleted },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }
}
