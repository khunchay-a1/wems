import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CalendarPreference,
  LicenseBranch,
  LicenseLevel,
  LicenseType,
} from '../../../../generated/prisma/enums';
import { PageQueryDto } from '../../../../common/http/pagination';
import { UserRefDto } from '../../../../common/http/common.dto';

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) employeeCode!: string | null;
  @ApiProperty() displayNameTh!: string;
  @ApiProperty({ nullable: true, type: String }) displayNameEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) position!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) departmentId!: string | null;
  @ApiProperty() locale!: string;
  @ApiProperty({ enum: CalendarPreference, enumName: 'CalendarPreference' })
  calendar!: CalendarPreference;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty() mfaEnabled!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lockedUntil!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastLoginAt!: string | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() version!: number;
}

export class LicenseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ enum: LicenseType, enumName: 'LicenseType' }) type!: LicenseType;
  @ApiProperty({ enum: LicenseBranch, enumName: 'LicenseBranch', nullable: true })
  branch!: LicenseBranch | null;
  @ApiProperty({ enum: LicenseLevel, enumName: 'LicenseLevel', nullable: true })
  level!: LicenseLevel | null;
  @ApiProperty() licenseNo!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) issuedAt!: string | null;
  @ApiProperty({ format: 'date' }) expiresAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) fileId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) verifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: UserRefDto }) verifiedBy!: UserRefDto | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'Expired as of today (Asia/Bangkok)' }) isExpired!: boolean;
}

export class UserDetailDto extends UserDto {
  @ApiProperty({ type: [LicenseDto] }) licenses!: LicenseDto[];
}

export class CreatedUserDto {
  @ApiProperty({ type: UserDetailDto }) user!: UserDetailDto;
  @ApiProperty({
    description: 'Temporary password — shown once; the user must change it at first sign-in',
  })
  temporaryPassword!: string;
}

export class TemporaryPasswordDto {
  @ApiProperty() temporaryPassword!: string;
}

export class DirectoryUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayNameTh!: string;
  @ApiProperty({ nullable: true, type: String }) displayNameEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) position!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) departmentId!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
}

export class ListUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) roleCode?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() departmentId?: string;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;
}

class UserProfileFields {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) displayNameTh!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  displayNameEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  employeeCode?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  departmentId?: string | null;
  @ApiPropertyOptional({ enum: ['th', 'en'] }) @IsOptional() @IsIn(['th', 'en']) locale?:
    'th' | 'en';
  @ApiPropertyOptional({ enum: CalendarPreference, enumName: 'CalendarPreference' })
  @IsOptional()
  @IsEnum(CalendarPreference)
  calendar?: CalendarPreference;
}

export class CreateUserDto extends UserProfileFields {
  @ApiProperty() @Transform(trimLower) @IsEmail() @MaxLength(254) email!: string;

  @ApiProperty({ type: [String], example: ['ENGINEER'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleCodes!: string[];

  @ApiPropertyOptional({ description: 'Omit to generate a random temporary password' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  temporaryPassword?: string;
}

export class UpdateUserDto extends PartialType(UserProfileFields) {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roleCodes?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Self-service profile (M01 §3): organisational fields stay with user.manage. */
export class UpdateOwnProfileDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayNameTh?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  displayNameEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;
  @ApiPropertyOptional({ enum: ['th', 'en'] }) @IsOptional() @IsIn(['th', 'en']) locale?:
    'th' | 'en';
  @ApiPropertyOptional({ enum: CalendarPreference, enumName: 'CalendarPreference' })
  @IsOptional()
  @IsEnum(CalendarPreference)
  calendar?: CalendarPreference;
}

export class LicenseInputDto {
  @ApiProperty({ enum: LicenseType, enumName: 'LicenseType' })
  @IsEnum(LicenseType)
  type!: LicenseType;
  @ApiPropertyOptional({ enum: LicenseBranch, enumName: 'LicenseBranch', nullable: true })
  @IsOptional()
  @IsEnum(LicenseBranch)
  branch?: LicenseBranch | null;
  @ApiPropertyOptional({ enum: LicenseLevel, enumName: 'LicenseLevel', nullable: true })
  @IsOptional()
  @IsEnum(LicenseLevel)
  level?: LicenseLevel | null;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(50) licenseNo!: string;
  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issuedAt?: string | null;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) expiresAt!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  fileId?: string | null;
}

export class UpdateLicenseDto extends PartialType(LicenseInputDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class DepartmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty() isActive!: boolean;
}

export class CreateDepartmentDto {
  @ApiProperty({ example: 'DES' }) @Matches(/^[A-Z0-9-]{2,20}$/) code!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) nameTh!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameTh?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RoleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty() userCount!: number;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'QA_REVIEWER' }) @Matches(/^[A-Z][A-Z0-9_]{1,40}$/) code!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) nameTh!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) permissions!: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameTh?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class PermissionInfoDto {
  @ApiProperty() code!: string;
  @ApiProperty() phase!: number;
  @ApiProperty() descriptionTh!: string;
}
