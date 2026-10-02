import type {
  Department,
  ProfessionalLicense,
  Role,
  User,
  UserRole,
} from '../../../generated/prisma/client';
import { iso, toDateOnly } from '../../../common/prisma/helpers';
import type { DepartmentDto, DirectoryUserDto, LicenseDto, UserDto } from './dto/users.dto';

export type UserWithRoles = User & { roles: (UserRole & { role: Role })[] };

export function toUserDto(u: UserWithRoles): UserDto {
  return {
    id: u.id,
    email: u.email,
    employeeCode: u.employeeCode,
    displayNameTh: u.displayNameTh,
    displayNameEn: u.displayNameEn,
    position: u.position,
    phone: u.phone,
    departmentId: u.departmentId,
    locale: u.locale,
    calendar: u.calendar,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    mfaEnabled: u.mfaEnabled,
    lockedUntil: iso(u.lockedUntil),
    lastLoginAt: iso(u.lastLoginAt),
    roles: u.roles.map((r) => r.role.code).sort(),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    version: u.version,
  };
}

export function toLicenseDto(
  l: ProfessionalLicense,
  today: string,
  names: Map<string, string>,
): LicenseDto {
  return {
    id: l.id,
    userId: l.userId,
    type: l.type,
    branch: l.branch,
    level: l.level,
    licenseNo: l.licenseNo,
    issuedAt: toDateOnly(l.issuedAt),
    expiresAt: toDateOnly(l.expiresAt)!,
    fileId: l.fileId,
    verifiedAt: iso(l.verifiedAt),
    verifiedBy: l.verifiedById
      ? { id: l.verifiedById, displayName: names.get(l.verifiedById) ?? '' }
      : null,
    isActive: l.isActive,
    isExpired: toDateOnly(l.expiresAt)! < today,
  };
}

export function toDirectoryDto(u: User): DirectoryUserDto {
  return {
    id: u.id,
    displayNameTh: u.displayNameTh,
    displayNameEn: u.displayNameEn,
    position: u.position,
    departmentId: u.departmentId,
    isActive: u.isActive && !u.deletedAt,
    avatarUrl: null,
  };
}

export function toDepartmentDto(d: Department): DepartmentDto {
  return { id: d.id, code: d.code, nameTh: d.nameTh, nameEn: d.nameEn, isActive: d.isActive };
}
