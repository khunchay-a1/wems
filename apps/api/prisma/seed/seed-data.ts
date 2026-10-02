import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type LicenseBranch,
  type LicenseLevel,
  type LimitComparator,
  type LimitEvaluation,
  type NumberedEntity,
  type ParameterCategory,
  Prisma,
  type PrismaClient,
  type ProjectRole,
  type ReviewStepKind,
  type SequenceReset,
  type StandardCategory,
} from '../../src/generated/prisma/client';
import { parseCsv } from './csv';

/** docs/data/seed — the single source of seed data (docs/03-data-model.md §11). */
export const SEED_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'data', 'seed');

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8')) as T;
const readCsv = <K extends string>(name: string) =>
  parseCsv<K>(readFileSync(join(SEED_DIR, name), 'utf8'));
const bool = (v: string | undefined) => v?.toLowerCase() === 'true';
const opt = (v: string | undefined) => (v === undefined || v === '' ? null : v);

interface RolesFile {
  permissions: { code: string; phase: number; descriptionTh: string; descriptionEn?: string }[];
  roles: {
    code: string;
    nameTh: string;
    nameEn?: string;
    description?: string;
    isSystem: boolean;
    permissions: string[];
  }[];
}

interface TemplatesFile {
  templates: {
    code: string;
    name: string;
    description?: string;
    steps: {
      stepOrder: number;
      kind: ReviewStepKind;
      name: string;
      allowedProjectRoles: ProjectRole[];
      requiresSignature: boolean;
      requiresLicense: boolean;
      dueDays: number;
      isOptional: boolean;
    }[];
  }[];
}

export function loadRolesFile(): RolesFile {
  return readJson<RolesFile>('roles.json');
}

/** Seeds phase 0–1 master data. Idempotent: every step is an upsert or insert-if-missing. */
export async function seedMasterData(
  prisma: PrismaClient,
  log: (m: string) => void = () => {},
): Promise<void> {
  // 1. roles + permissions (permissions are only set when a role is first created, so admin edits survive)
  const roles = loadRolesFile();
  for (const r of roles.roles) {
    const existing = await prisma.role.findUnique({ where: { code: r.code } });
    if (existing) {
      await prisma.role.update({
        where: { code: r.code },
        data: { nameTh: r.nameTh, nameEn: r.nameEn ?? null, isSystem: r.isSystem },
      });
    } else {
      await prisma.role.create({
        data: {
          code: r.code,
          nameTh: r.nameTh,
          nameEn: r.nameEn ?? null,
          description: r.description ?? null,
          isSystem: r.isSystem,
          permissions: { create: r.permissions.map((permission) => ({ permission })) },
        },
      });
    }
  }
  log(`roles: ${roles.roles.length}`);

  // 2. numbering schemes (insert if missing — admins may change patterns later)
  const schemes = readCsv<'entity' | 'scope' | 'pattern' | 'reset_policy'>('numbering-schemes.csv');
  for (const s of schemes) {
    await prisma.numberingScheme.upsert({
      where: { entity_scope: { entity: s.entity as NumberedEntity, scope: s.scope } },
      update: {},
      create: {
        entity: s.entity as NumberedEntity,
        scope: s.scope,
        pattern: s.pattern,
        resetPolicy: s.reset_policy as SequenceReset,
      },
    });
  }
  log(`numbering schemes: ${schemes.length}`);

  // 3. settings (insert keys that do not exist yet)
  const settings = readJson<{ settings: Record<string, unknown> }>('settings.json').settings;
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as Prisma.InputJsonValue },
    });
  }
  log(`settings: ${Object.keys(settings).length}`);

  // 4. disciplines
  const disciplines = readCsv<'code' | 'name_th' | 'name_en' | 'sort_order'>('disciplines.csv');
  for (const d of disciplines) {
    const data = { nameTh: d.name_th, nameEn: d.name_en, sortOrder: Number(d.sort_order) };
    await prisma.discipline.upsert({
      where: { code: d.code },
      update: data,
      create: { code: d.code, ...data },
    });
  }
  log(`disciplines: ${disciplines.length}`);

  // 5. workflow templates (steps replaced only while the template has never been used)
  const templates = readJson<TemplatesFile>('workflow-templates.json').templates;
  for (const t of templates) {
    const tpl = await prisma.workflowTemplate.upsert({
      where: { code: t.code },
      update: { name: t.name, description: t.description ?? null },
      create: { code: t.code, name: t.name, description: t.description ?? null },
    });
    const used = await prisma.reviewCycle.count({ where: { templateId: tpl.id } });
    if (used === 0) {
      await prisma.workflowTemplateStep.deleteMany({ where: { templateId: tpl.id } });
      await prisma.workflowTemplateStep.createMany({
        data: t.steps.map((s) => ({ templateId: tpl.id, ...s })),
      });
    }
  }
  log(`workflow templates: ${templates.length}`);

  // 6. document types
  const types = readCsv<
    | 'code'
    | 'name_th'
    | 'name_en'
    | 'requires_pdf_rendition'
    | 'requires_licensed_approver'
    | 'allowed_license_branches'
    | 'min_license_level'
    | 'default_workflow'
    | 'sort_order'
  >('document-types.csv');
  for (const t of types) {
    const wf = t.default_workflow
      ? await prisma.workflowTemplate.findUnique({ where: { code: t.default_workflow } })
      : null;
    const data = {
      nameTh: t.name_th,
      nameEn: t.name_en,
      requiresPdfRendition: bool(t.requires_pdf_rendition),
      requiresLicensedApprover: bool(t.requires_licensed_approver),
      allowedLicenseBranches: (opt(t.allowed_license_branches)?.split('|') ??
        []) as LicenseBranch[],
      minLicenseLevel: opt(t.min_license_level) as LicenseLevel | null,
      defaultWorkflowTemplateId: wf?.id ?? null,
      sortOrder: Number(t.sort_order),
    };
    await prisma.documentType.upsert({
      where: { code: t.code },
      update: data,
      create: { code: t.code, ...data },
    });
  }
  log(`document types: ${types.length}`);

  // 7. parameters (analytical methods are phase 3)
  const params = readCsv<
    | 'code'
    | 'name_th'
    | 'name_en'
    | 'category'
    | 'default_unit'
    | 'decimals'
    | 'is_field_parameter'
    | 'sort_order'
  >('parameters.csv');
  for (const p of params) {
    const data = {
      nameTh: p.name_th,
      nameEn: p.name_en,
      category: p.category as ParameterCategory,
      defaultUnit: p.default_unit,
      decimals: Number(p.decimals),
      isFieldParameter: bool(p.is_field_parameter),
      sortOrder: Number(p.sort_order),
    };
    await prisma.parameter.upsert({
      where: { code: p.code },
      update: data,
      create: { code: p.code, ...data },
    });
  }
  log(`parameters: ${params.length}`);

  // 8. regulatory standards + limits
  const rows = readCsv<
    | 'standard_code'
    | 'standard_name_th'
    | 'category'
    | 'subtype'
    | 'source_ref'
    | 'gazette_ref'
    | 'effective_date'
    | 'parameter_code'
    | 'comparator'
    | 'min_value'
    | 'max_value'
    | 'unit'
    | 'evaluation'
    | 'note'
  >('standards.csv');
  const standardIds = new Map<string, string>();
  for (const r of rows) {
    if (!standardIds.has(r.standard_code)) {
      const data = {
        nameTh: r.standard_name_th,
        category: r.category as StandardCategory,
        subtype: opt(r.subtype),
        sourceRef: opt(r.source_ref),
        gazetteRef: opt(r.gazette_ref),
        effectiveDate: r.effective_date ? new Date(`${r.effective_date}T00:00:00.000Z`) : null,
      };
      const std = await prisma.regulatoryStandard.upsert({
        where: { code: r.standard_code },
        update: data,
        create: { code: r.standard_code, ...data },
      });
      standardIds.set(r.standard_code, std.id);
    }
    const param = await prisma.parameter.findUnique({ where: { code: r.parameter_code } });
    if (!param) throw new Error(`standards.csv: unknown parameter ${r.parameter_code}`);
    const standardId = standardIds.get(r.standard_code)!;
    const limit = {
      comparator: r.comparator as LimitComparator,
      minValue: r.min_value ? new Prisma.Decimal(r.min_value) : null,
      maxValue: r.max_value ? new Prisma.Decimal(r.max_value) : null,
      unit: r.unit,
      evaluation: (opt(r.evaluation) ?? 'AUTO') as LimitEvaluation,
      note: opt(r.note),
    };
    await prisma.standardLimit.upsert({
      where: { standardId_parameterId: { standardId, parameterId: param.id } },
      update: limit,
      create: { standardId, parameterId: param.id, ...limit },
    });
  }
  log(`standards: ${standardIds.size}, limits: ${rows.length}`);
}
