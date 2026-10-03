import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService, diffFields } from '../../../common/audit/audit.service';
import type { AuthUser } from '../../../common/auth/auth-user';
import { Problem } from '../../../common/errors/problem';
import { pageArgs, type Page } from '../../../common/http/pagination';
import {
  type NumberingContext,
  renderNumber,
  validatePattern,
} from '../../../common/numbering/pattern';
import { NumberingService } from '../../../common/numbering/numbering.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isSettingKey, PUBLIC_SETTING_KEYS } from '../../../common/settings/setting-schemas';
import { SettingsService } from '../../../common/settings/settings.service';
import { bangkokInstant } from '../../../common/time/business-calendar';
import { ClockService } from '../../../common/time/clock';
import type {
  AppConfigDto,
  AuditLogDto,
  AuditLogQueryDto,
  NumberingSchemeDto,
  PreviewNumberRequestDto,
  SettingDto,
  UpdateNumberingSchemeDto,
} from './dto/admin.dto';

const SAMPLE_CTX: NumberingContext = {
  project: 'P26-001',
  client: 'ABC',
  discipline: 'PR',
  type: 'DWG',
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  // ───────────── numbering ─────────────

  async listSchemes(): Promise<NumberingSchemeDto[]> {
    const rows = await this.prisma.numberingScheme.findMany({
      orderBy: [{ scope: 'asc' }, { entity: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      entity: r.entity,
      scope: r.scope,
      pattern: r.pattern,
      resetPolicy: r.resetPolicy,
      isActive: r.isActive,
      example: renderNumber(r.pattern, SAMPLE_CTX, 1, this.clock.now()),
    }));
  }

  async updateScheme(id: string, dto: UpdateNumberingSchemeDto): Promise<NumberingSchemeDto> {
    const err = validatePattern(dto.pattern);
    if (err)
      throw new Problem('NUMBERING_PATTERN_INVALID', { errors: [{ field: 'pattern', code: err }] });
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.numberingScheme.findUnique({ where: { id } });
      if (!before) throw new Problem('NOT_FOUND');
      if (before.scope === 'GLOBAL' && dto.isActive === false) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'isActive', code: 'GLOBAL_REQUIRED' }],
        });
      }
      const data = {
        pattern: dto.pattern,
        resetPolicy: dto.resetPolicy,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      };
      await tx.numberingScheme.update({ where: { id }, data });
      await this.audit.record(tx, {
        action: 'numbering.update',
        entityType: 'NumberingScheme',
        entityId: id,
        summary: `${before.entity} ${before.scope}`,
        changes: diffFields(before, data),
      });
    });
    return (await this.listSchemes()).find((s) => s.id === id)!;
  }

  async preview(dto: PreviewNumberRequestDto): Promise<string> {
    const ctx: NumberingContext = { ...SAMPLE_CTX };
    if (dto.projectId) {
      const p = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        include: { client: true },
      });
      if (p) Object.assign(ctx, { project: p.code, client: p.client.code });
    }
    if (dto.disciplineCode) ctx.discipline = dto.disciplineCode;
    if (dto.typeCode) ctx.type = dto.typeCode;
    return this.numbering.preview(dto.entity, ctx, {
      projectId: dto.projectId,
      pattern: dto.pattern,
    });
  }

  // ───────────── settings ─────────────

  async getSetting(user: AuthUser, key: string): Promise<SettingDto> {
    if (!isSettingKey(key)) throw new Problem('NOT_FOUND');
    if (!PUBLIC_SETTING_KEYS.includes(key) && !user.permissions.has('settings.manage'))
      throw new Problem('NOT_FOUND');
    return { key, value: await this.settings.get(key) };
  }

  async listSettings(): Promise<SettingDto[]> {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r) => ({ key: r.key, value: r.value }));
  }

  async putSetting(user: AuthUser, key: string, value: unknown): Promise<SettingDto> {
    if (!isSettingKey(key)) throw new Problem('NOT_FOUND');
    return { key, value: await this.settings.put(key, value, user.id) };
  }

  async appConfig(): Promise<AppConfigDto> {
    const [min, company, maintenance] = await Promise.all([
      this.settings.get('mobile.minSupportedVersion'),
      this.settings.get('company.profile'),
      // optional: databases seeded before the key existed have no row
      this.settings.get('mobile.maintenanceMessage').catch(() => ''),
    ]);
    return {
      minSupportedVersion: min,
      latestVersion: min.android,
      ...(maintenance ? { maintenanceMessage: maintenance } : {}),
      companyNameTh: company.nameTh,
      companyNameEn: company.nameEn,
    };
  }

  // ───────────── audit ─────────────

  async auditLogs(q: AuditLogQueryDto): Promise<Page<AuditLogDto>> {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.occurredFrom || q.occurredTo
        ? {
            occurredAt: {
              ...(q.occurredFrom ? { gte: bangkokInstant(q.occurredFrom, '00:00') } : {}),
              ...(q.occurredTo
                ? { lt: new Date(bangkokInstant(q.occurredTo, '00:00').getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { summary: { contains: q.q, mode: 'insensitive' } },
              { action: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((v): v is string => !!v))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, displayNameTh: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.displayNameTh]));
    return {
      data: rows.map((r) => ({
        id: r.id.toString(),
        occurredAt: r.occurredAt.toISOString(),
        actorType: r.actorType,
        actorId: r.actorId,
        actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        projectId: r.projectId,
        summary: r.summary,
        changes: r.changes,
        reason: r.reason,
        ip: r.ip,
        requestId: r.requestId,
      })),
      meta: { page, pageSize, total },
    };
  }

  /** CSV export of the filtered audit log (docs/06-security.md §9). Max 10,000 rows. */
  async auditCsv(q: AuditLogQueryDto): Promise<string> {
    const page = await this.auditLogs({ ...q, page: 1, pageSize: 100 });
    const rows: AuditLogDto[] = [...page.data];
    let p = 2;
    while (rows.length < Math.min(page.meta.total, 10_000)) {
      const next = await this.auditLogs({ ...q, page: p, pageSize: 100 });
      if (!next.data.length) break;
      rows.push(...next.data);
      p += 1;
    }
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'occurredAt',
      'actorName',
      'action',
      'entityType',
      'entityId',
      'summary',
      'reason',
      'ip',
      'changes',
    ];
    const lines = rows.map((r) =>
      [
        r.occurredAt,
        r.actorName,
        r.action,
        r.entityType,
        r.entityId,
        r.summary,
        r.reason,
        r.ip,
        r.changes,
      ]
        .map(esc)
        .join(','),
    );
    return `\uFEFF${header.join(',')}\n${lines.join('\n')}\n`;
  }
}
