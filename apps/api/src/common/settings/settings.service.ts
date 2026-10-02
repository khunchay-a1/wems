import { Injectable } from '@nestjs/common';
import { AuditService, diffFields } from '../audit/audit.service';
import { Problem } from '../errors/problem';
import type { Tx } from '../prisma/helpers';
import { PrismaService } from '../prisma/prisma.service';
import { SETTING_SCHEMAS, type SettingKey, type SettingValue } from './setting-schemas';

/** Typed access to the Setting table with validation (M01 §7). */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingKey>(key: K, tx?: Tx): Promise<SettingValue<K>> {
    const row = await (tx ?? this.prisma).setting.findUnique({ where: { key } });
    const parsed = SETTING_SCHEMAS[key].safeParse(row?.value);
    if (!parsed.success) throw new Error(`Setting ${key} is missing or invalid — run the seed`);
    return parsed.data as SettingValue<K>;
  }

  async put<K extends SettingKey>(
    key: K,
    value: unknown,
    actorId: string,
  ): Promise<SettingValue<K>> {
    const parsed = SETTING_SCHEMAS[key].safeParse(value);
    if (!parsed.success) {
      throw new Problem('SETTING_INVALID', {
        errors: parsed.error.issues.map((i) => ({
          field: ['value', ...i.path].join('.'),
          code: i.code,
          message: i.message,
        })),
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { key } });
      await tx.setting.upsert({
        where: { key },
        update: { value: parsed.data, updatedById: actorId },
        create: { key, value: parsed.data, updatedById: actorId },
      });
      await this.audit.record(tx, {
        action: 'setting.update',
        entityType: 'Setting',
        entityId: key,
        changes: diffFields({ value: before?.value ?? null }, { value: parsed.data }),
      });
      return parsed.data as SettingValue<K>;
    });
  }
}
