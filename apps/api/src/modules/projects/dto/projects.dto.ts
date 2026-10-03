import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ProjectRole,
  ProjectStatus,
  ProjectType,
  RevisionScheme,
  SequenceReset,
} from '../../../generated/prisma/enums';
import { BlockedActionDto, UserRefDto } from '../../../common/http/common.dto';
import { PageQueryDto } from '../../../common/http/pagination';
import { emptyToNull, toBool, trim, upperCode } from '../../../common/http/transforms';

export class ListProjectsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Comma separated ProjectStatus values' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Comma separated ProjectType values' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() clientId?: string;

  @ApiPropertyOptional({ description: 'Only projects where I am an active member' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  mine?: boolean;
}

class ProjectFields {
  @ApiProperty({ maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  nameEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  siteId?: string | null;
  @ApiProperty({ enum: ProjectType, enumName: 'ProjectType' })
  @IsEnum(ProjectType)
  type!: ProjectType;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  contractNo?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '12500000.00',
    description: 'Decimal(14,2) as string',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  contractValue?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsDateString({ strict: true })
  plannedStartDate?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsDateString({ strict: true })
  plannedEndDate?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsDateString({ strict: true })
  actualStartDate?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsDateString({ strict: true })
  actualEndDate?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'BR-PRJ-002: added/kept as a PROJECT_MANAGER member',
  })
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @ApiPropertyOptional({
    enum: RevisionScheme,
    enumName: 'RevisionScheme',
    description: 'BR-PRJ-004',
  })
  @IsOptional()
  @IsEnum(RevisionScheme)
  revisionScheme?: RevisionScheme;

  @ApiPropertyOptional({ description: 'BR-DOC-042' })
  @IsOptional()
  @IsBoolean()
  requireSeparationOfDuties?: boolean;
}

export class CreateProjectDto extends ProjectFields {
  @ApiProperty({ format: 'uuid' }) @IsUUID() clientId!: string;
}

export class UpdateProjectDto extends PartialType(ProjectFields) {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;

  @ApiPropertyOptional({
    description: 'BR-PRJ-001: project.manage only, before the project has documents',
  })
  @IsOptional()
  @Transform(upperCode)
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,29}$/)
  code?: string;
}

export class ProjectActionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ maxLength: 1000, description: 'Required for reopen and cancel' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ClientRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
}

export class SiteRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class ProjectDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ type: ClientRefDto }) client!: ClientRefDto;
  @ApiProperty({ type: SiteRefDto, nullable: true }) site!: SiteRefDto | null;
  @ApiProperty({ enum: ProjectType, enumName: 'ProjectType' }) type!: ProjectType;
  @ApiProperty({ enum: ProjectStatus, enumName: 'ProjectStatus' }) status!: ProjectStatus;
  @ApiProperty({ nullable: true, type: String }) contractNo!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Decimal as string' }) contractValue!:
    string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) plannedStartDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) plannedEndDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) actualStartDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) actualEndDate!: string | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) projectManager!: UserRefDto | null;
  @ApiProperty({ enum: RevisionScheme, enumName: 'RevisionScheme' })
  revisionScheme!: RevisionScheme;
  @ApiProperty() requireSeparationOfDuties!: boolean;
  @ApiProperty({ nullable: true, type: String }) closedAt!: string | null;
  @ApiProperty({
    enum: ProjectRole,
    enumName: 'ProjectRole',
    nullable: true,
    description: 'My active role in the project',
  })
  myRole!: ProjectRole | null;
  @ApiProperty() memberCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [String], example: ['edit', 'start', 'manageMembers', 'createDocument'] })
  allowedActions!: string[];
  @ApiProperty({ type: [BlockedActionDto] }) blockedActions!: BlockedActionDto[];
}

// ───────────── members ─────────────

export class AddMemberDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userId!: string;
  @ApiProperty({ enum: ProjectRole, enumName: 'ProjectRole' })
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

export class UpdateMemberDto extends PickType(AddMemberDto, ['role'] as const) {}

export class MemberDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) displayNameEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) position!: string | null;
  @ApiProperty({ enum: ProjectRole, enumName: 'ProjectRole' }) role!: ProjectRole;
  @ApiProperty() addedAt!: string;
  @ApiProperty() isProjectManager!: boolean;
  @ApiProperty() isActiveUser!: boolean;
}

// ───────────── overview ─────────────

export class StatusCountDto {
  @ApiProperty() status!: string;
  @ApiProperty() count!: number;
}

export class TransmittalSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() number!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String }) sentAt!: string | null;
}

export class ProjectOverviewDto {
  @ApiProperty() documentCount!: number;
  @ApiProperty({
    type: [StatusCountDto],
    description: 'Active documents by status of their current revision (NO_REVISION when none)',
  })
  documentsByRevisionStatus!: StatusCountDto[];
  @ApiProperty({ type: [StatusCountDto], description: 'Documents by DocumentStatus' })
  documentsByStatus!: StatusCountDto[];
  @ApiProperty() activeReviewSteps!: number;
  @ApiProperty() overdueReviewSteps!: number;
  @ApiProperty() draftTransmittals!: number;
  @ApiProperty({ type: [TransmittalSummaryDto] }) recentTransmittals!: TransmittalSummaryDto[];
}

/** Open items that block closing a project (BR-PRJ-021), returned in the problem `extra`. */
export class OpenItemDto {
  @ApiProperty({ example: 'REVIEW_CYCLE' }) kind!: string;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
}

// ───────────── numbering ─────────────

export class ProjectNumberingDto {
  @ApiProperty() pattern!: string;
  @ApiProperty({ enum: SequenceReset, enumName: 'SequenceReset' }) resetPolicy!: SequenceReset;
  @ApiProperty({ description: 'true when the project overrides the global DOCUMENT pattern' })
  isOverride!: boolean;
  @ApiProperty() globalPattern!: string;
  @ApiProperty({ example: 'P26-001-PR-DWG-001' }) example!: string;
}

export class PutProjectNumberingDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'null = use the global pattern',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  pattern!: string | null;
}
