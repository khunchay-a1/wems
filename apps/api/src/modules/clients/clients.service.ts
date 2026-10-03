import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type {
  Client,
  ClientContact,
  RegulatoryStandard,
  Site,
} from '../../generated/prisma/client';
import type { ClientType } from '../../generated/prisma/enums';
import { AuditService, diffFields } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { Problem } from '../../common/errors/problem';
import { csv, pageArgs, parseSort, type Page } from '../../common/http/pagination';
import { IdGenerator } from '../../common/ids/id-generator';
import {
  assertVersionedUpdate,
  bumpVersion,
  decimalToString,
  notDeleted,
  type Tx,
} from '../../common/prisma/helpers';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClockService } from '../../common/time/clock';
import {
  codeVariant,
  isValidThaiTaxId,
  siteFieldViolations,
  suggestClientCode,
  suggestedBuildingStandardCode,
} from './domain/client-rules';
import type {
  ClientDto,
  ClientSummaryDto,
  ContactDto,
  CreateClientDto,
  CreateContactDto,
  CreateSiteDto,
  ListClientsQueryDto,
  SaveClientResultDto,
  SiteDto,
  UpdateClientDto,
  UpdateContactDto,
  UpdateSiteDto,
} from './dto/clients.dto';

/** Project statuses that still count as "open" for the client list and summary. */
const OPEN_PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD'] as const;

type ClientRow = Client & { _count: { projects: number } };
type SiteRow = Site & { defaultStandard: RegulatoryStandard | null };

/** M02 clients, contacts and sites (BR-CRM-001..007). */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  // ───────────────────────── clients ─────────────────────────

  async list(q: ListClientsQueryDto, user: AuthUser): Promise<Page<ClientDto>> {
    const { skip, take, page, pageSize } = pageArgs(q);
    const sort = parseSort(q.sort, ['code', 'nameTh', 'province', 'updatedAt'] as const, [
      { field: 'nameTh', dir: 'asc' },
    ]);
    const types = csv(q.clientType) as ClientType[] | undefined;
    const where: Prisma.ClientWhereInput = {
      ...notDeleted,
      ...(q.isActive === undefined ? {} : { isActive: q.isActive }),
      ...(types?.length ? { clientType: { in: types } } : {}),
      ...(q.province ? { province: q.province } : {}),
      ...(q.q
        ? {
            OR: [
              { code: { contains: q.q, mode: 'insensitive' } },
              { nameTh: { contains: q.q, mode: 'insensitive' } },
              { nameEn: { contains: q.q, mode: 'insensitive' } },
              { taxId: { startsWith: q.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: this.clientInclude,
        orderBy: sort.map((s) => ({ [s.field]: s.dir })),
        skip,
        take,
      }),
      this.prisma.client.count({ where }),
    ]);
    const inUse = await this.inUse(rows.map((r) => r.id));
    return {
      data: rows.map((r) => this.toClientDto(r, user, inUse.has(r.id))),
      meta: { page, pageSize, total },
    };
  }

  private readonly clientInclude = {
    _count: {
      select: {
        projects: { where: { deletedAt: null, status: { in: [...OPEN_PROJECT_STATUSES] } } },
      },
    },
  } satisfies Prisma.ClientInclude;

  async get(id: string, user: AuthUser): Promise<ClientDto> {
    const row = await this.prisma.client.findFirst({
      where: { id, ...notDeleted },
      include: this.clientInclude,
    });
    if (!row) throw new Problem('NOT_FOUND');
    const inUse = await this.inUse([id]);
    return this.toClientDto(row, user, inUse.has(id));
  }

  /** BR-CRM-003: clients referenced by projects, lab jobs or quotations cannot be deleted. */
  private async inUse(ids: string[], tx: Tx = this.prisma): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const [p, l, q] = await Promise.all([
      tx.project.groupBy({ by: ['clientId'], where: { clientId: { in: ids } } }),
      tx.labJob.groupBy({ by: ['clientId'], where: { clientId: { in: ids } } }),
      tx.quotation.groupBy({ by: ['clientId'], where: { clientId: { in: ids } } }),
    ]);
    return new Set([...p, ...l, ...q].map((r) => r.clientId));
  }

  private toClientDto(c: ClientRow, user: AuthUser, inUse: boolean): ClientDto {
    const canManage = user.permissions.has('client.manage');
    const allowed: string[] = [];
    const blocked: { action: string; code: string }[] = [];
    if (canManage) {
      allowed.push('edit', c.isActive ? 'deactivate' : 'activate', 'addContact', 'addSite');
      if (inUse) blocked.push({ action: 'delete', code: 'CLIENT_IN_USE' });
      else allowed.push('delete');
    }
    return {
      id: c.id,
      code: c.code,
      nameTh: c.nameTh,
      nameEn: c.nameEn,
      clientType: c.clientType,
      taxId: c.taxId,
      branchCode: c.branchCode,
      industry: c.industry,
      addressLine: c.addressLine,
      subdistrict: c.subdistrict,
      district: c.district,
      province: c.province,
      postcode: c.postcode,
      phone: c.phone,
      email: c.email,
      website: c.website,
      notes: c.notes,
      isActive: c.isActive,
      openProjectCount: c._count.projects,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      version: c.version,
      allowedActions: allowed,
      blockedActions: blocked,
    };
  }

  /** BR-CRM-002 checksum (400 on the field) and duplicate taxId + branch warning. */
  private async checkTaxId(
    tx: Tx,
    taxId: string | null | undefined,
    branchCode: string | null | undefined,
    exceptId?: string,
  ): Promise<SaveClientResultDto['warnings']> {
    if (!taxId) return [];
    if (!isValidThaiTaxId(taxId)) {
      throw new Problem('VALIDATION_FAILED', {
        rule: 'BR-CRM-002',
        errors: [{ field: 'taxId', code: 'TAX_ID_CHECKSUM' }],
      });
    }
    const dupes = await tx.client.findMany({
      where: {
        taxId,
        branchCode: branchCode ?? null,
        ...notDeleted,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { code: true },
    });
    return dupes.length
      ? [{ code: 'CLIENT_TAX_ID_EXISTS', clients: dupes.map((d) => d.code) }]
      : [];
  }

  /** BR-CRM-001: proposed code that is not taken yet. */
  async suggestCode(nameEn: string | undefined, tx: Tx = this.prisma): Promise<string> {
    const base = suggestClientCode(nameEn);
    if (base) {
      for (let attempt = 1; attempt <= 50; attempt++) {
        const code = codeVariant(base, attempt);
        if (!(await tx.client.findUnique({ where: { code }, select: { id: true } }))) return code;
      }
    }
    const n = await tx.client.count();
    for (let i = n + 1; ; i++) {
      const code = `CL${String(i).padStart(4, '0')}`;
      if (!(await tx.client.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
  }

  async create(dto: CreateClientDto, user: AuthUser): Promise<SaveClientResultDto> {
    const id = this.ids.next();
    const warnings = await this.prisma.$transaction(async (tx) => {
      const warnings = await this.checkTaxId(tx, dto.taxId, dto.branchCode);
      const code = dto.code ?? (await this.suggestCode(dto.nameEn ?? undefined, tx));
      if (await tx.client.findUnique({ where: { code }, select: { id: true } })) {
        throw new Problem('DUPLICATE', {
          rule: 'BR-CRM-001',
          errors: [{ field: 'code', code: 'DUPLICATE' }],
        });
      }
      const { code: _c, ...fields } = dto;
      await tx.client.create({ data: { ...fields, id, code, createdById: user.id } });
      await this.audit.record(tx, {
        action: 'client.create',
        entityType: 'Client',
        entityId: id,
        summary: `${code} ${dto.nameTh}`,
      });
      return warnings;
    });
    return { ...(await this.get(id, user)), warnings };
  }

  async update(id: string, dto: UpdateClientDto, user: AuthUser): Promise<SaveClientResultDto> {
    const warnings = await this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findFirst({ where: { id, ...notDeleted } });
      if (!before) throw new Problem('NOT_FOUND');
      const taxChanged =
        (dto.taxId !== undefined && dto.taxId !== before.taxId) ||
        (dto.branchCode !== undefined && dto.branchCode !== before.branchCode);
      const warnings = taxChanged
        ? await this.checkTaxId(
            tx,
            dto.taxId === undefined ? before.taxId : dto.taxId,
            dto.branchCode === undefined ? before.branchCode : dto.branchCode,
            id,
          )
        : [];
      const { version, ...data } = dto;
      const res = await tx.client.updateMany({
        where: { id, version, ...notDeleted },
        data: { ...data, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        async () => !!(await tx.client.findFirst({ where: { id, ...notDeleted } })),
        () => this.get(id, user),
      );
      await this.audit.record(tx, {
        action:
          dto.isActive === false && before.isActive
            ? 'client.deactivate'
            : dto.isActive === true && !before.isActive
              ? 'client.activate'
              : 'client.update',
        entityType: 'Client',
        entityId: id,
        changes: diffFields(before, data),
      });
      return warnings;
    });
    return { ...(await this.get(id, user)), warnings };
  }

  /** Soft delete (BR-CRM-003). */
  async remove(id: string, version: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.client.findFirst({ where: { id, ...notDeleted } });
      if (!c) throw new Problem('NOT_FOUND');
      if ((await this.inUse([id], tx)).has(id)) {
        throw new Problem('CLIENT_IN_USE', { rule: 'BR-CRM-003' });
      }
      const res = await tx.client.updateMany({
        where: { id, version, ...notDeleted },
        data: { deletedAt: this.clock.now(), ...bumpVersion },
      });
      await assertVersionedUpdate(res, () => Promise.resolve(true));
      await this.audit.record(tx, {
        action: 'client.delete',
        entityType: 'Client',
        entityId: id,
        summary: `${c.code} ${c.nameTh}`,
      });
    });
  }

  async summary(id: string): Promise<ClientSummaryDto> {
    const c = await this.prisma.client.findFirst({ where: { id, ...notDeleted } });
    if (!c) throw new Problem('NOT_FOUND');
    const projectWhere = { clientId: id, ...notDeleted };
    const [
      projectCount,
      openProjectCount,
      siteCount,
      contactCount,
      labJobCount,
      quotationCount,
      recent,
    ] = await this.prisma.$transaction([
      this.prisma.project.count({ where: projectWhere }),
      this.prisma.project.count({
        where: { ...projectWhere, status: { in: [...OPEN_PROJECT_STATUSES] } },
      }),
      this.prisma.site.count({ where: { clientId: id, ...notDeleted } }),
      this.prisma.clientContact.count({ where: { clientId: id, ...notDeleted } }),
      this.prisma.labJob.count({ where: { clientId: id } }),
      this.prisma.quotation.count({ where: { clientId: id } }),
      this.prisma.project.findMany({
        where: projectWhere,
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, code: true, name: true, status: true },
      }),
    ]);
    return {
      projectCount,
      openProjectCount,
      siteCount,
      contactCount,
      labJobCount,
      quotationCount,
      recentProjects: recent,
    };
  }

  /** Throws CLIENT_INACTIVE for new links to an inactive client (BR-CRM-003) — used by M03. */
  async assertSelectable(tx: Tx, clientId: string, siteId?: string | null): Promise<void> {
    const c = await tx.client.findFirst({ where: { id: clientId, ...notDeleted } });
    if (!c) {
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'clientId', code: 'NOT_FOUND' }],
      });
    }
    if (!c.isActive) throw new Problem('CLIENT_INACTIVE', { rule: 'BR-CRM-003' });
    if (siteId) {
      const s = await tx.site.findFirst({ where: { id: siteId, clientId, ...notDeleted } });
      if (!s) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'siteId', code: 'NOT_FOUND' }],
        });
      }
    }
  }

  // ───────────────────────── contacts ─────────────────────────

  private async clientOr404(tx: Tx, clientId: string): Promise<Client> {
    const c = await tx.client.findFirst({ where: { id: clientId, ...notDeleted } });
    if (!c) throw new Problem('NOT_FOUND');
    return c;
  }

  async listContacts(clientId: string): Promise<ContactDto[]> {
    await this.clientOr404(this.prisma, clientId);
    const rows = await this.prisma.clientContact.findMany({
      where: { clientId, ...notDeleted },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toContactDto);
  }

  /** BR-CRM-004: only one primary contact — setting one clears the others. */
  private async clearPrimary(tx: Tx, clientId: string, exceptId: string): Promise<void> {
    await tx.clientContact.updateMany({
      where: { clientId, isPrimary: true, id: { not: exceptId } },
      data: { isPrimary: false, ...bumpVersion },
    });
  }

  async createContact(clientId: string, dto: CreateContactDto): Promise<ContactDto> {
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      await this.clientOr404(tx, clientId);
      await tx.clientContact.create({ data: { ...dto, id, clientId } });
      if (dto.isPrimary) await this.clearPrimary(tx, clientId, id);
      await this.audit.record(tx, {
        action: 'client.contact.create',
        entityType: 'ClientContact',
        entityId: id,
        summary: dto.name,
      });
    });
    return toContactDto(await this.prisma.clientContact.findUniqueOrThrow({ where: { id } }));
  }

  async updateContact(
    clientId: string,
    contactId: string,
    dto: UpdateContactDto,
  ): Promise<ContactDto> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.clientContact.findFirst({
        where: { id: contactId, clientId, ...notDeleted },
      });
      if (!before) throw new Problem('NOT_FOUND');
      const { version, ...data } = dto;
      const res = await tx.clientContact.updateMany({
        where: { id: contactId, version, ...notDeleted },
        data: { ...data, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => Promise.resolve(toContactDto(before)),
      );
      if (dto.isPrimary) await this.clearPrimary(tx, clientId, contactId);
      await this.audit.record(tx, {
        action: 'client.contact.update',
        entityType: 'ClientContact',
        entityId: contactId,
        changes: diffFields(before, data),
      });
    });
    return toContactDto(
      await this.prisma.clientContact.findUniqueOrThrow({ where: { id: contactId } }),
    );
  }

  async removeContact(clientId: string, contactId: string, version: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.clientContact.findFirst({
        where: { id: contactId, clientId, ...notDeleted },
      });
      if (!c) throw new Problem('NOT_FOUND');
      const res = await tx.clientContact.updateMany({
        where: { id: contactId, version, ...notDeleted },
        data: { deletedAt: this.clock.now(), isPrimary: false, ...bumpVersion },
      });
      await assertVersionedUpdate(res, () => Promise.resolve(true));
      await this.audit.record(tx, {
        action: 'client.contact.delete',
        entityType: 'ClientContact',
        entityId: contactId,
      });
    });
  }

  /** BR-CRM-007 / docs/06-security.md §8: blank personal fields, keep the row for history. */
  async anonymizeContact(contactId: string): Promise<ContactDto> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.clientContact.findFirst({ where: { id: contactId } });
      if (!c) throw new Problem('NOT_FOUND');
      await tx.clientContact.update({
        where: { id: contactId },
        data: {
          name: '',
          position: null,
          department: null,
          phone: null,
          email: null,
          notes: null,
          isPrimary: false,
          receivesTransmittals: false,
          receivesLabReports: false,
          isActive: false,
          ...bumpVersion,
        },
      });
      // the audit entry deliberately carries no personal data
      await this.audit.record(tx, {
        action: 'client.contact.anonymize',
        entityType: 'ClientContact',
        entityId: contactId,
      });
    });
    return toContactDto(
      await this.prisma.clientContact.findUniqueOrThrow({ where: { id: contactId } }),
    );
  }

  // ───────────────────────── sites ─────────────────────────

  async listSites(clientId: string, isActive?: boolean): Promise<SiteDto[]> {
    await this.clientOr404(this.prisma, clientId);
    const rows = await this.prisma.site.findMany({
      where: { clientId, ...notDeleted, ...(isActive === undefined ? {} : { isActive }) },
      include: { defaultStandard: true },
      orderBy: { code: 'asc' },
    });
    return rows.map(toSiteDto);
  }

  async getSite(clientId: string, siteId: string): Promise<SiteDto> {
    const s = await this.prisma.site.findFirst({
      where: { id: siteId, clientId, ...notDeleted },
      include: { defaultStandard: true },
    });
    if (!s) throw new Problem('NOT_FOUND');
    return toSiteDto(s);
  }

  private assertSiteFields(input: Parameters<typeof siteFieldViolations>[0]): void {
    const errors = siteFieldViolations(input);
    if (errors.length) throw new Problem('VALIDATION_FAILED', { rule: 'BR-CRM-005', errors });
  }

  /** BR-CRM-006: proposes the building effluent standard when none was chosen. */
  private async resolveStandard(
    tx: Tx,
    standardId: string | null | undefined,
    siteType: string,
    buildingClass: Site['buildingClass'] | undefined,
  ): Promise<string | null | undefined> {
    if (standardId) {
      const s = await tx.regulatoryStandard.findUnique({ where: { id: standardId } });
      if (!s) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'defaultStandardId', code: 'NOT_FOUND' }],
        });
      }
      return standardId;
    }
    if (standardId === undefined && siteType === 'BUILDING' && buildingClass) {
      const s = await tx.regulatoryStandard.findUnique({
        where: { code: suggestedBuildingStandardCode(buildingClass) },
        select: { id: true },
      });
      return s?.id ?? null;
    }
    return standardId;
  }

  async createSite(clientId: string, dto: CreateSiteDto): Promise<SiteDto> {
    this.assertSiteFields(dto);
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      await this.clientOr404(tx, clientId);
      if (await tx.site.findFirst({ where: { clientId, code: dto.code }, select: { id: true } })) {
        throw new Problem('DUPLICATE', {
          rule: 'BR-CRM-005',
          errors: [{ field: 'code', code: 'DUPLICATE' }],
        });
      }
      const defaultStandardId = await this.resolveStandard(
        tx,
        dto.defaultStandardId,
        dto.siteType,
        dto.buildingClass,
      );
      await tx.site.create({
        data: {
          ...dto,
          id,
          clientId,
          latitude: toDecimal(dto.latitude),
          longitude: toDecimal(dto.longitude),
          defaultStandardId: defaultStandardId ?? null,
        },
      });
      await this.audit.record(tx, {
        action: 'client.site.create',
        entityType: 'Site',
        entityId: id,
        summary: `${dto.code} ${dto.name}`,
      });
    });
    return this.getSite(clientId, id);
  }

  async updateSite(clientId: string, siteId: string, dto: UpdateSiteDto): Promise<SiteDto> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.site.findFirst({ where: { id: siteId, clientId, ...notDeleted } });
      if (!before) throw new Problem('NOT_FOUND');
      const siteType = dto.siteType ?? before.siteType;
      const buildingClass =
        dto.buildingClass === undefined ? before.buildingClass : dto.buildingClass;
      this.assertSiteFields({
        siteType,
        buildingClass,
        factoryRegistrationNo:
          dto.factoryRegistrationNo === undefined
            ? before.factoryRegistrationNo
            : dto.factoryRegistrationNo,
        factoryTypeCode:
          dto.factoryTypeCode === undefined ? before.factoryTypeCode : dto.factoryTypeCode,
      });
      const { version, latitude, longitude, ...rest } = dto;
      const classChanged =
        dto.buildingClass !== undefined && dto.buildingClass !== before.buildingClass;
      const defaultStandardId =
        dto.defaultStandardId !== undefined || (classChanged && !before.defaultStandardId)
          ? await this.resolveStandard(tx, dto.defaultStandardId, siteType, buildingClass)
          : undefined;
      const data: Prisma.SiteUpdateManyMutationInput & { defaultStandardId?: string | null } = {
        ...rest,
        ...(latitude !== undefined ? { latitude: toDecimal(latitude) } : {}),
        ...(longitude !== undefined ? { longitude: toDecimal(longitude) } : {}),
        ...(defaultStandardId !== undefined ? { defaultStandardId } : {}),
      };
      const res = await tx.site.updateMany({
        where: { id: siteId, version, ...notDeleted },
        data: { ...data, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => this.getSite(clientId, siteId),
      );
      await this.audit.record(tx, {
        action: 'client.site.update',
        entityType: 'Site',
        entityId: siteId,
        changes: diffFields(before, data),
      });
    });
    return this.getSite(clientId, siteId);
  }

  async removeSite(clientId: string, siteId: string, version: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const s = await tx.site.findFirst({ where: { id: siteId, clientId, ...notDeleted } });
      if (!s) throw new Problem('NOT_FOUND');
      const [projects, labJobs] = await Promise.all([
        tx.project.count({ where: { siteId } }),
        tx.labJob.count({ where: { siteId } }),
      ]);
      if (projects + labJobs > 0) throw new Problem('SITE_IN_USE', { rule: 'BR-CRM-003' });
      const res = await tx.site.updateMany({
        where: { id: siteId, version, ...notDeleted },
        data: { deletedAt: this.clock.now(), ...bumpVersion },
      });
      await assertVersionedUpdate(res, () => Promise.resolve(true));
      await this.audit.record(tx, {
        action: 'client.site.delete',
        entityType: 'Site',
        entityId: siteId,
        summary: `${s.code} ${s.name}`,
      });
    });
  }
}

function toDecimal(v: number | null | undefined): Prisma.Decimal | null {
  return v === null || v === undefined ? null : new Prisma.Decimal(v.toFixed(6));
}

export function toContactDto(c: ClientContact): ContactDto {
  return {
    id: c.id,
    clientId: c.clientId,
    name: c.name,
    position: c.position,
    department: c.department,
    phone: c.phone,
    email: c.email,
    isPrimary: c.isPrimary,
    receivesTransmittals: c.receivesTransmittals,
    receivesLabReports: c.receivesLabReports,
    notes: c.notes,
    isActive: c.isActive,
    isAnonymized: c.name === '',
    version: c.version,
  };
}

export function toSiteDto(s: SiteRow): SiteDto {
  return {
    id: s.id,
    clientId: s.clientId,
    code: s.code,
    name: s.name,
    siteType: s.siteType,
    addressLine: s.addressLine,
    subdistrict: s.subdistrict,
    district: s.district,
    province: s.province,
    postcode: s.postcode,
    latitude: decimalToString(s.latitude),
    longitude: decimalToString(s.longitude),
    buildingClass: s.buildingClass,
    factoryRegistrationNo: s.factoryRegistrationNo,
    factoryTypeCode: s.factoryTypeCode,
    defaultStandard: s.defaultStandard
      ? { id: s.defaultStandard.id, code: s.defaultStandard.code, nameTh: s.defaultStandard.nameTh }
      : null,
    notes: s.notes,
    isActive: s.isActive,
    version: s.version,
  };
}
