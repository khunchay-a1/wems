import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { AuditService, diffFields } from '../../../common/audit/audit.service';
import type { AuthUser } from '../../../common/auth/auth-user';
import { checkPasswordPolicy, hashSecret } from '../../../common/auth/password';
import { Problem } from '../../../common/errors/problem';
import { pageArgs, parseSort, type Page } from '../../../common/http/pagination';
import { IdGenerator } from '../../../common/ids/id-generator';
import {
  assertVersionedUpdate,
  bumpVersion,
  fromDateOnly,
  notDeleted,
  type Tx,
} from '../../../common/prisma/helpers';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { bangkokDate } from '../../../common/time/business-calendar';
import { ClockService } from '../../../common/time/clock';
import { AuthService } from '../auth/auth.service';
import type {
  CreatedUserDto,
  CreateUserDto,
  DirectoryUserDto,
  LicenseDto,
  LicenseInputDto,
  ListUsersQueryDto,
  UpdateLicenseDto,
  UpdateOwnProfileDto,
  UpdateUserDto,
  UserDetailDto,
  UserDto,
} from './dto/users.dto';
import { toDirectoryDto, toLicenseDto, toUserDto } from './users.mapper';

const userInclude = { roles: { include: { role: true } } } as const;

/** Users, role assignment and professional licenses (M01 §3, BR-PLT-001/002/004). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
    private readonly auth: AuthService,
  ) {}

  async list(q: ListUsersQueryDto): Promise<Page<UserDto>> {
    const { skip, take, page, pageSize } = pageArgs(q);
    const sort = parseSort(
      q.sort,
      ['displayNameTh', 'email', 'createdAt', 'lastLoginAt'] as const,
      [{ field: 'displayNameTh', dir: 'asc' }],
    );
    const where: Prisma.UserWhereInput = {
      ...notDeleted,
      ...(q.isActive === undefined ? {} : { isActive: q.isActive }),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.roleCode ? { roles: { some: { role: { code: q.roleCode } } } } : {}),
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { displayNameTh: { contains: q.q, mode: 'insensitive' } },
              { displayNameEn: { contains: q.q, mode: 'insensitive' } },
              { employeeCode: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: sort.map((s) => ({ [s.field]: s.dir })),
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: rows.map(toUserDto), meta: { page, pageSize, total } };
  }

  async directory(): Promise<DirectoryUserDto[]> {
    const rows = await this.prisma.user.findMany({
      where: notDeleted,
      orderBy: { displayNameTh: 'asc' },
    });
    return rows.map(toDirectoryDto);
  }

  async get(id: string): Promise<UserDetailDto> {
    const u = await this.prisma.user.findFirst({
      where: { id, ...notDeleted },
      include: { ...userInclude, licenses: true },
    });
    if (!u) throw new Problem('NOT_FOUND');
    return { ...toUserDto(u), licenses: await this.licenseDtos(u.licenses) };
  }

  private async licenseDtos(
    rows: Prisma.ProfessionalLicenseGetPayload<object>[],
  ): Promise<LicenseDto[]> {
    const verifierIds = [
      ...new Set(rows.map((l) => l.verifiedById).filter((v): v is string => !!v)),
    ];
    const verifiers = verifierIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: verifierIds } },
          select: { id: true, displayNameTh: true },
        })
      : [];
    const names = new Map(verifiers.map((v) => [v.id, v.displayNameTh]));
    const today = bangkokDate(this.clock.now());
    return rows
      .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())
      .map((l) => toLicenseDto(l, today, names));
  }

  private async resolveRoles(tx: Tx, codes: string[]): Promise<{ id: string; code: string }[]> {
    const unique = [...new Set(codes)];
    const roles = await tx.role.findMany({
      where: { code: { in: unique } },
      select: { id: true, code: true },
    });
    const missing = unique.filter((c) => !roles.some((r) => r.code === c));
    if (missing.length) {
      throw new Problem('VALIDATION_FAILED', {
        errors: missing.map((m) => ({ field: 'roleCodes', code: 'UNKNOWN_ROLE', message: m })),
      });
    }
    return roles;
  }

  private async assertDepartment(tx: Tx, departmentId: string | null | undefined): Promise<void> {
    if (!departmentId) return;
    const d = await tx.department.findUnique({ where: { id: departmentId } });
    if (!d)
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'departmentId', code: 'NOT_FOUND' }],
      });
  }

  /** BR-PLT-002: there must always be at least one active ADMIN. Locks ADMIN assignments while checking. */
  private async assertNotLastAdmin(tx: Tx, userId: string): Promise<void> {
    const admins = await tx.$queryRaw<{ user_id: string }[]>`
      SELECT ur.user_id FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id AND r.code = 'ADMIN'
      JOIN users u ON u.id = ur.user_id AND u.is_active AND u.deleted_at IS NULL
      FOR UPDATE OF ur`;
    if (!admins.some((a) => a.user_id !== userId))
      throw new Problem('LAST_ADMIN', { rule: 'BR-PLT-002' });
  }

  private generateTemporaryPassword(): string {
    // 16 chars from a readable alphabet (no 0/O/1/l)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = randomBytes(16);
    return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  }

  async create(dto: CreateUserDto): Promise<CreatedUserDto> {
    const temporaryPassword = dto.temporaryPassword ?? this.generateTemporaryPassword();
    const violation = checkPasswordPolicy(temporaryPassword, {
      email: dto.email,
      names: [dto.displayNameTh, dto.displayNameEn],
    });
    if (violation)
      throw new Problem('PASSWORD_POLICY', {
        errors: [{ field: 'temporaryPassword', code: violation }],
      });
    const passwordHash = await hashSecret(temporaryPassword);
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: dto.email } })) {
        throw new Problem('DUPLICATE', {
          errors: [{ field: 'email', code: 'DUPLICATE' }],
          rule: 'BR-PLT-001',
        });
      }
      const roles = await this.resolveRoles(tx, dto.roleCodes);
      await this.assertDepartment(tx, dto.departmentId);
      await tx.user.create({
        data: {
          id,
          email: dto.email,
          displayNameTh: dto.displayNameTh,
          displayNameEn: dto.displayNameEn ?? null,
          employeeCode: dto.employeeCode || null,
          position: dto.position ?? null,
          phone: dto.phone ?? null,
          departmentId: dto.departmentId ?? null,
          locale: dto.locale ?? 'th',
          calendar: dto.calendar ?? 'BUDDHIST',
          passwordHash,
          mustChangePassword: true,
          roles: { create: roles.map((r) => ({ roleId: r.id, grantedById: null })) },
        },
      });
      await this.audit.record(tx, {
        action: 'user.create',
        entityType: 'User',
        entityId: id,
        summary: dto.email,
        changes: {
          before: {},
          after: {
            email: dto.email,
            displayNameTh: dto.displayNameTh,
            roles: roles.map((r) => r.code),
          },
        },
      });
    });
    return { user: await this.get(id), temporaryPassword };
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: { id, ...notDeleted },
        include: userInclude,
      });
      if (!before) throw new Problem('NOT_FOUND');
      const beforeRoles = before.roles.map((r) => r.role.code).sort();
      const nextRoles = dto.roleCodes ? [...new Set(dto.roleCodes)].sort() : beforeRoles;
      const losingAdmin =
        beforeRoles.includes('ADMIN') && (!nextRoles.includes('ADMIN') || dto.isActive === false);
      if (losingAdmin && before.isActive) await this.assertNotLastAdmin(tx, id);
      await this.assertDepartment(tx, dto.departmentId);

      const data: Prisma.UserUpdateManyMutationInput = {
        ...(dto.displayNameTh !== undefined ? { displayNameTh: dto.displayNameTh } : {}),
        ...(dto.displayNameEn !== undefined ? { displayNameEn: dto.displayNameEn } : {}),
        ...(dto.employeeCode !== undefined ? { employeeCode: dto.employeeCode || null } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.calendar !== undefined ? { calendar: dto.calendar } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      };
      const res = await tx.user.updateMany({
        where: { id, version: dto.version, ...notDeleted },
        data: { ...data, ...bumpVersion },
      });
      await assertVersionedUpdate(
        res,
        () => Promise.resolve(true),
        () => Promise.resolve(toUserDto(before)),
      );

      if (dto.roleCodes) {
        const roles = await this.resolveRoles(tx, nextRoles);
        await tx.userRole.deleteMany({
          where: { userId: id, roleId: { notIn: roles.map((r) => r.id) } },
        });
        for (const r of roles) {
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: id, roleId: r.id } },
            update: {},
            create: { userId: id, roleId: r.id, grantedById: actor.id },
          });
        }
      }
      if (dto.isActive === false && before.isActive) {
        await this.auth.revokeAllSessions(tx, id, 'deactivated');
      }
      const { roles: _r, ...plain } = before;
      await this.audit.record(tx, {
        action:
          dto.roleCodes && nextRoles.join() !== beforeRoles.join()
            ? 'user.update_roles'
            : 'user.update',
        entityType: 'User',
        entityId: id,
        changes: diffFields({ ...plain, roles: beforeRoles }, { ...data, roles: nextRoles }),
      });
    });
    return this.get(id);
  }

  async updateOwnProfile(user: AuthUser, dto: UpdateOwnProfileDto): Promise<UserDetailDto> {
    return this.update(user.id, { ...dto, roleCodes: undefined, isActive: undefined }, user);
  }

  async resetPassword(id: string): Promise<{ temporaryPassword: string }> {
    const temporaryPassword = this.generateTemporaryPassword();
    const hash = await hashSecret(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findFirst({ where: { id, ...notDeleted } });
      if (!u) throw new Problem('NOT_FOUND');
      await tx.user.update({
        where: { id },
        data: {
          passwordHash: hash,
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
          ...bumpVersion,
        },
      });
      await this.auth.revokeAllSessions(tx, id, 'password_reset');
      await this.audit.record(tx, {
        action: 'user.reset_password',
        entityType: 'User',
        entityId: id,
      });
    });
    return { temporaryPassword };
  }

  async unlock(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findFirst({ where: { id, ...notDeleted } });
      if (!u) throw new Problem('NOT_FOUND');
      await tx.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } });
      await this.audit.record(tx, { action: 'user.unlock', entityType: 'User', entityId: id });
    });
  }

  async revokeSessions(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findFirst({ where: { id, ...notDeleted } });
      if (!u) throw new Problem('NOT_FOUND');
      const n = await this.auth.revokeAllSessions(tx, id, 'admin_revoked');
      await this.audit.record(tx, {
        action: 'user.revoke_sessions',
        entityType: 'User',
        entityId: id,
        summary: `${n} sessions`,
      });
    });
  }

  // ───────────── licenses (BR-PLT-004) ─────────────

  private assertLicenseAccess(actor: AuthUser, userId: string): void {
    if (actor.id !== userId && !actor.permissions.has('user.manage'))
      throw new Problem('NOT_FOUND');
  }

  async listLicenses(actor: AuthUser, userId: string): Promise<LicenseDto[]> {
    this.assertLicenseAccess(actor, userId);
    return this.licenseDtos(await this.prisma.professionalLicense.findMany({ where: { userId } }));
  }

  async addLicense(actor: AuthUser, userId: string, dto: LicenseInputDto): Promise<LicenseDto> {
    this.assertLicenseAccess(actor, userId);
    const manager = actor.permissions.has('user.manage');
    const id = this.ids.next();
    await this.prisma.$transaction(async (tx) => {
      if (!(await tx.user.findFirst({ where: { id: userId, ...notDeleted } })))
        throw new Problem('NOT_FOUND');
      await tx.professionalLicense.create({
        data: {
          id,
          userId,
          type: dto.type,
          branch: dto.branch ?? null,
          level: dto.level ?? null,
          licenseNo: dto.licenseNo,
          issuedAt: fromDateOnly(dto.issuedAt),
          expiresAt: fromDateOnly(dto.expiresAt)!,
          fileId: dto.fileId ?? null,
          // BR-PLT-004: self-entered licenses need verification; managers' entries are verified
          verifiedAt: manager && actor.id !== userId ? this.clock.now() : null,
          verifiedById: manager && actor.id !== userId ? actor.id : null,
        },
      });
      await this.audit.record(tx, {
        action: 'license.create',
        entityType: 'ProfessionalLicense',
        entityId: id,
        summary: `${dto.type} ${dto.licenseNo} for ${userId}`,
      });
    });
    return (await this.listLicenses(actor, userId)).find((l) => l.id === id)!;
  }

  async updateLicense(
    actor: AuthUser,
    userId: string,
    licenseId: string,
    dto: UpdateLicenseDto,
  ): Promise<LicenseDto> {
    this.assertLicenseAccess(actor, userId);
    const manager = actor.permissions.has('user.manage');
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.professionalLicense.findFirst({ where: { id: licenseId, userId } });
      if (!before) throw new Problem('NOT_FOUND');
      const data: Prisma.ProfessionalLicenseUpdateInput = {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.branch !== undefined ? { branch: dto.branch } : {}),
        ...(dto.level !== undefined ? { level: dto.level } : {}),
        ...(dto.licenseNo !== undefined ? { licenseNo: dto.licenseNo } : {}),
        ...(dto.issuedAt !== undefined ? { issuedAt: fromDateOnly(dto.issuedAt) } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: fromDateOnly(dto.expiresAt)! } : {}),
        ...(dto.fileId !== undefined ? { fileId: dto.fileId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      };
      const material = ['type', 'branch', 'level', 'licenseNo', 'expiresAt'].some((k) => k in data);
      // A self-edit of anything that matters for BR-DOC-040 needs re-verification
      if (material && !manager) Object.assign(data, { verifiedAt: null, verifiedById: null });
      await tx.professionalLicense.update({ where: { id: licenseId }, data });
      await this.audit.record(tx, {
        action: 'license.update',
        entityType: 'ProfessionalLicense',
        entityId: licenseId,
        changes: diffFields(before, data),
      });
    });
    return (await this.listLicenses(actor, userId)).find((l) => l.id === licenseId)!;
  }

  async verifyLicense(actor: AuthUser, licenseId: string): Promise<LicenseDto> {
    const lic = await this.prisma.$transaction(async (tx) => {
      const l = await tx.professionalLicense.findUnique({ where: { id: licenseId } });
      if (!l) throw new Problem('NOT_FOUND');
      await tx.professionalLicense.update({
        where: { id: licenseId },
        data: { verifiedAt: this.clock.now(), verifiedById: actor.id },
      });
      await this.audit.record(tx, {
        action: 'license.verify',
        entityType: 'ProfessionalLicense',
        entityId: licenseId,
      });
      return l;
    });
    return (await this.listLicenses(actor, lic.userId)).find((l) => l.id === licenseId)!;
  }
}
