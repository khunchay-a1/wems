import { Injectable } from '@nestjs/common';
import type { Document, DocumentRevision } from '../../generated/prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import type { Permission } from '../../common/auth/permissions';
import { ProjectAccessService, type ProjectAccess } from '../../common/auth/project-access.service';
import { Problem } from '../../common/errors/problem';
import { notDeleted, type Tx } from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { documentsEditable } from '../projects/domain/project-state-machine';

export interface DocumentContext {
  doc: Document;
  access: ProjectAccess;
}

export interface RevisionContext extends DocumentContext {
  rev: DocumentRevision;
}

/**
 * Project scope for M04 resources (docs/06-security.md §3.1): a document is visible to users who
 * can see its project and hold document.read; otherwise 404 (AT-DOC-14).
 */
@Injectable()
export class DocumentAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectAccessService,
  ) {}

  async document(user: AuthUser, id: string, tx?: Tx): Promise<DocumentContext> {
    const db = tx ?? this.prisma;
    const doc = await db.document.findFirst({ where: { id, ...notDeleted } });
    if (!doc) throw new Problem('NOT_FOUND');
    const access = await this.projects.resolve(user, doc.projectId, tx);
    if (!access || !user.permissions.has('document.read')) throw new Problem('NOT_FOUND');
    return { doc, access };
  }

  async revision(user: AuthUser, id: string, tx?: Tx): Promise<RevisionContext> {
    const db = tx ?? this.prisma;
    const rev = await db.documentRevision.findUnique({ where: { id } });
    if (!rev) throw new Problem('NOT_FOUND');
    const ctx = await this.document(user, rev.documentId, tx);
    return { ...ctx, rev };
  }

  async project(user: AuthUser, projectId: string, tx?: Tx): Promise<ProjectAccess> {
    const access = await this.projects.resolve(user, projectId, tx);
    if (!access || !user.permissions.has('document.read')) throw new Problem('NOT_FOUND');
    return access;
  }

  /** 403 unless the user holds the permission (they can already see the resource). */
  require(user: AuthUser, permission: Permission, rule?: string): void {
    if (!user.permissions.has(permission)) throw new Problem('FORBIDDEN', { rule });
  }

  /** BR-DOC-014 / BR-PRJ-020: documents change only while the project is PLANNING or ACTIVE. */
  assertProjectEditable(access: ProjectAccess): void {
    if (!documentsEditable(access.project.status)) {
      throw new Problem('DOC_PROJECT_NOT_EDITABLE', { rule: 'BR-DOC-014' });
    }
  }
}
