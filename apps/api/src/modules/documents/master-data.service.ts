import { Injectable } from '@nestjs/common';
import type {
  Discipline,
  DocumentType,
  WorkflowTemplate,
  WorkflowTemplateStep,
} from '../../generated/prisma/client';
import { AuditService, diffFields } from '../../common/audit/audit.service';
import { ChangeLogService, Scope } from '../../common/audit/change-log.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { Problem } from '../../common/errors/problem';
import { IdGenerator } from '../../common/ids/id-generator';
import type { Tx } from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { templateStepErrors } from './domain/workflow-template';
import type {
  CreateDisciplineDto,
  CreateDocumentTypeDto,
  CreateWorkflowTemplateDto,
  DisciplineDto,
  DocumentTypeDto,
  UpdateDisciplineDto,
  UpdateDocumentTypeDto,
  UpdateWorkflowTemplateDto,
  WorkflowStepInputDto,
  WorkflowTemplateDto,
} from './dto/master-data.dto';

/** Document master data: disciplines, document types, workflow templates (M04 §5, §10). */
@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly changes: ChangeLogService,
    private readonly ids: IdGenerator,
  ) {}

  private showInactive(user: AuthUser, include?: boolean): boolean {
    return !!include && user.permissions.has('masterdata.manage');
  }

  // ───────────── disciplines ─────────────

  async disciplines(user: AuthUser, includeInactive?: boolean): Promise<DisciplineDto[]> {
    const rows = await this.prisma.discipline.findMany({
      where: this.showInactive(user, includeInactive) ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map(toDisciplineDto);
  }

  async createDiscipline(dto: CreateDisciplineDto): Promise<DisciplineDto> {
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      if (await tx.discipline.findUnique({ where: { code: dto.code } })) {
        throw new Problem('DUPLICATE', { errors: [{ field: 'code', code: 'DUPLICATE' }] });
      }
      await tx.discipline.create({ data: { ...dto, id } });
      await this.audit.record(tx, {
        action: 'masterdata.discipline.create',
        entityType: 'Discipline',
        entityId: id,
        summary: dto.code,
      });
      await this.changes.touch(tx, Scope.global, 'Discipline', id);
    });
    return toDisciplineDto(await this.prisma.discipline.findUniqueOrThrow({ where: { id } }));
  }

  async updateDiscipline(id: string, dto: UpdateDisciplineDto): Promise<DisciplineDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.discipline.findUnique({ where: { id } });
      if (!before) throw new Problem('NOT_FOUND');
      const after = await tx.discipline.update({ where: { id }, data: dto });
      await this.audit.record(tx, {
        action: 'masterdata.discipline.update',
        entityType: 'Discipline',
        entityId: id,
        changes: diffFields(before, { ...dto }),
      });
      await this.changes.touch(tx, Scope.global, 'Discipline', id);
      return after;
    });
    return toDisciplineDto(row);
  }

  // ───────────── document types ─────────────

  async documentTypes(user: AuthUser, includeInactive?: boolean): Promise<DocumentTypeDto[]> {
    const rows = await this.prisma.documentType.findMany({
      where: this.showInactive(user, includeInactive) ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map(toDocumentTypeDto);
  }

  private async assertTemplate(tx: Tx, id: string | null | undefined): Promise<void> {
    if (!id) return;
    const t = await tx.workflowTemplate.findUnique({ where: { id } });
    if (!t || !t.isActive) {
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'defaultWorkflowTemplateId', code: 'NOT_FOUND' }],
      });
    }
  }

  async createDocumentType(dto: CreateDocumentTypeDto): Promise<DocumentTypeDto> {
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      if (await tx.documentType.findUnique({ where: { code: dto.code } })) {
        throw new Problem('DUPLICATE', { errors: [{ field: 'code', code: 'DUPLICATE' }] });
      }
      await this.assertTemplate(tx, dto.defaultWorkflowTemplateId);
      await tx.documentType.create({ data: { ...dto, id } });
      await this.audit.record(tx, {
        action: 'masterdata.document_type.create',
        entityType: 'DocumentType',
        entityId: id,
        summary: dto.code,
      });
      await this.changes.touch(tx, Scope.global, 'DocumentType', id);
    });
    return toDocumentTypeDto(await this.prisma.documentType.findUniqueOrThrow({ where: { id } }));
  }

  async updateDocumentType(id: string, dto: UpdateDocumentTypeDto): Promise<DocumentTypeDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.documentType.findUnique({ where: { id } });
      if (!before) throw new Problem('NOT_FOUND');
      await this.assertTemplate(tx, dto.defaultWorkflowTemplateId);
      const after = await tx.documentType.update({ where: { id }, data: dto });
      await this.audit.record(tx, {
        action: 'masterdata.document_type.update',
        entityType: 'DocumentType',
        entityId: id,
        changes: diffFields(before, { ...dto }),
      });
      await this.changes.touch(tx, Scope.global, 'DocumentType', id);
      return after;
    });
    return toDocumentTypeDto(row);
  }

  // ───────────── workflow templates ─────────────

  async templates(user: AuthUser, includeInactive?: boolean): Promise<WorkflowTemplateDto[]> {
    const rows = await this.prisma.workflowTemplate.findMany({
      where: this.showInactive(user, includeInactive) ? {} : { isActive: true },
      include: { steps: { orderBy: [{ stepOrder: 'asc' }, { name: 'asc' }] } },
      orderBy: { code: 'asc' },
    });
    return rows.map(toTemplateDto);
  }

  async template(id: string): Promise<WorkflowTemplateDto> {
    const t = await this.prisma.workflowTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: [{ stepOrder: 'asc' }, { name: 'asc' }] } },
    });
    if (!t) throw new Problem('NOT_FOUND');
    return toTemplateDto(t);
  }

  private assertSteps(steps: WorkflowStepInputDto[]): void {
    const errors = templateStepErrors(steps);
    if (errors.length) throw new Problem('VALIDATION_FAILED', { rule: 'BR-DOC-031', errors });
  }

  private stepRows(templateId: string, steps: WorkflowStepInputDto[]) {
    return steps.map((s) => ({
      id: this.ids.next(),
      templateId,
      stepOrder: s.stepOrder,
      kind: s.kind,
      name: s.name,
      allowedProjectRoles: s.allowedProjectRoles ?? [],
      requiresSignature: s.requiresSignature ?? false,
      requiresLicense: s.requiresLicense ?? false,
      dueDays: s.dueDays ?? 3,
      isOptional: s.isOptional ?? false,
    }));
  }

  async createTemplate(dto: CreateWorkflowTemplateDto): Promise<WorkflowTemplateDto> {
    this.assertSteps(dto.steps);
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      if (await tx.workflowTemplate.findUnique({ where: { code: dto.code } })) {
        throw new Problem('DUPLICATE', { errors: [{ field: 'code', code: 'DUPLICATE' }] });
      }
      await tx.workflowTemplate.create({
        data: {
          id,
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
        },
      });
      await tx.workflowTemplateStep.createMany({ data: this.stepRows(id, dto.steps) });
      await this.audit.record(tx, {
        action: 'masterdata.workflow_template.create',
        entityType: 'WorkflowTemplate',
        entityId: id,
        summary: dto.code,
      });
    });
    return this.template(id);
  }

  /** Steps are replaced as a set; running review cycles keep their copied steps (M04 §5). */
  async updateTemplate(id: string, dto: UpdateWorkflowTemplateDto): Promise<WorkflowTemplateDto> {
    if (dto.steps) this.assertSteps(dto.steps);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.workflowTemplate.findUnique({
        where: { id },
        include: { steps: true },
      });
      if (!before) throw new Problem('NOT_FOUND');
      const { steps, ...fields } = dto;
      await tx.workflowTemplate.update({ where: { id }, data: fields });
      if (steps) {
        await tx.workflowTemplateStep.deleteMany({ where: { templateId: id } });
        await tx.workflowTemplateStep.createMany({ data: this.stepRows(id, steps) });
      }
      await this.audit.record(tx, {
        action: 'masterdata.workflow_template.update',
        entityType: 'WorkflowTemplate',
        entityId: id,
        changes: diffFields(
          { ...before, steps: before.steps.length },
          { ...fields, ...(steps ? { steps: steps.length } : {}) },
        ),
      });
    });
    return this.template(id);
  }
}

export function toDisciplineDto(d: Discipline): DisciplineDto {
  return {
    id: d.id,
    code: d.code,
    nameTh: d.nameTh,
    nameEn: d.nameEn,
    sortOrder: d.sortOrder,
    isActive: d.isActive,
  };
}

export function toDocumentTypeDto(t: DocumentType): DocumentTypeDto {
  return {
    id: t.id,
    code: t.code,
    nameTh: t.nameTh,
    nameEn: t.nameEn,
    requiresPdfRendition: t.requiresPdfRendition,
    requiresLicensedApprover: t.requiresLicensedApprover,
    allowedLicenseBranches: t.allowedLicenseBranches,
    minLicenseLevel: t.minLicenseLevel,
    defaultWorkflowTemplateId: t.defaultWorkflowTemplateId,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
  };
}

export function toTemplateDto(
  t: WorkflowTemplate & { steps: WorkflowTemplateStep[] },
): WorkflowTemplateDto {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    isActive: t.isActive,
    steps: t.steps.map((s) => ({
      id: s.id,
      stepOrder: s.stepOrder,
      kind: s.kind,
      name: s.name,
      allowedProjectRoles: s.allowedProjectRoles,
      requiresSignature: s.requiresSignature,
      requiresLicense: s.requiresLicense,
      dueDays: s.dueDays,
      isOptional: s.isOptional,
    })),
  };
}
