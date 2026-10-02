import { Injectable } from '@nestjs/common';
import { AuditService, diffFields } from '../../../common/audit/audit.service';
import { PERMISSION_INFO } from '../../../common/auth/permission-info';
import { isPermission, PERMISSIONS } from '../../../common/auth/permissions';
import { Problem } from '../../../common/errors/problem';
import { IdGenerator } from '../../../common/ids/id-generator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { CreateRoleDto, PermissionInfoDto, RoleDto, UpdateRoleDto } from './dto/users.dto';

/** Permissions the ADMIN role must keep so nobody can lock the organisation out (BR-PLT-002 spirit). */
const ADMIN_REQUIRED = ['user.manage', 'role.manage'];

/** Roles and their permissions (BR-PLT-003). Changes apply on the next request (AuthGuard loads from DB). */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ids: IdGenerator,
  ) {}

  permissions(): PermissionInfoDto[] {
    return PERMISSIONS.map((code) => ({
      code,
      ...(PERMISSION_INFO[code] ?? { phase: 0, descriptionTh: code }),
    }));
  }

  async list(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      nameTh: r.nameTh,
      nameEn: r.nameEn,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission).sort(),
      userCount: r._count.users,
    }));
  }

  private validatePermissions(perms: string[]): string[] {
    const unknown = perms.filter((p) => !isPermission(p));
    if (unknown.length) {
      throw new Problem('VALIDATION_FAILED', {
        errors: unknown.map((u) => ({
          field: 'permissions',
          code: 'UNKNOWN_PERMISSION',
          message: u,
        })),
      });
    }
    return [...new Set(perms)].sort();
  }

  async create(dto: CreateRoleDto): Promise<RoleDto> {
    const perms = this.validatePermissions(dto.permissions);
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      if (await tx.role.findUnique({ where: { code: dto.code } })) {
        throw new Problem('DUPLICATE', { errors: [{ field: 'code', code: 'DUPLICATE' }] });
      }
      await tx.role.create({
        data: {
          id,
          code: dto.code,
          nameTh: dto.nameTh,
          nameEn: dto.nameEn ?? null,
          description: dto.description ?? null,
          permissions: { create: perms.map((permission) => ({ permission })) },
        },
      });
      await this.audit.record(tx, {
        action: 'role.create',
        entityType: 'Role',
        entityId: id,
        changes: { before: {}, after: { code: dto.code, permissions: perms } },
      });
    });
    return (await this.list()).find((r) => r.id === id)!;
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleDto> {
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id }, include: { permissions: true } });
      if (!role) throw new Problem('NOT_FOUND');
      const before = role.permissions.map((p) => p.permission).sort();
      const next = dto.permissions ? this.validatePermissions(dto.permissions) : before;
      if (role.code === 'ADMIN' && ADMIN_REQUIRED.some((p) => !next.includes(p))) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [
            { field: 'permissions', code: 'ADMIN_LOCKOUT', message: ADMIN_REQUIRED.join(',') },
          ],
          rule: 'BR-PLT-003',
        });
      }
      await tx.role.update({
        where: { id },
        data: {
          ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
      });
      if (dto.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id, permission: { notIn: next } } });
        await tx.rolePermission.createMany({
          data: next.map((permission) => ({ roleId: id, permission })),
          skipDuplicates: true,
        });
      }
      await this.audit.record(tx, {
        action: dto.permissions ? 'role.update_permissions' : 'role.update',
        entityType: 'Role',
        entityId: id,
        summary: role.code,
        changes: diffFields(
          {
            nameTh: role.nameTh,
            nameEn: role.nameEn,
            description: role.description,
            permissions: before,
          },
          {
            ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh } : {}),
            ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            permissions: next,
          },
        ),
      });
    });
    return (await this.list()).find((r) => r.id === id)!;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role) throw new Problem('NOT_FOUND');
      if (role.isSystem) throw new Problem('ROLE_IS_SYSTEM', { rule: 'BR-PLT-003' });
      await tx.role.delete({ where: { id } });
      await this.audit.record(tx, {
        action: 'role.delete',
        entityType: 'Role',
        entityId: id,
        summary: role.code,
      });
    });
  }
}
