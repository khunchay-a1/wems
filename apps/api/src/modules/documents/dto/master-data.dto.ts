import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  LicenseBranch,
  LicenseLevel,
  ProjectRole,
  ReviewStepKind,
} from '../../../generated/prisma/enums';
import { emptyToNull, toBool, trim, upperCode } from '../../../common/http/transforms';

export class MasterListQueryDto {
  @ApiPropertyOptional({ description: 'Include inactive rows (masterdata.manage)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeInactive?: boolean;
}

// ───────────── disciplines ─────────────

export class DisciplineDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'PR' }) code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
}

export class CreateDisciplineDto {
  @ApiProperty({ example: 'PR', description: 'Used in document numbers; fixed after creation' })
  @Transform(upperCode)
  @Matches(/^[A-Z0-9]{1,10}$/)
  code!: string;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) nameTh!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) nameEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateDisciplineDto extends PartialType(OmitType(CreateDisciplineDto, ['code'])) {}

// ───────────── document types ─────────────

export class DocumentTypeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'DWG' }) code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() requiresPdfRendition!: boolean;
  @ApiProperty() requiresLicensedApprover!: boolean;
  @ApiProperty({ enum: LicenseBranch, enumName: 'LicenseBranch', isArray: true })
  allowedLicenseBranches!: LicenseBranch[];
  @ApiProperty({ enum: LicenseLevel, enumName: 'LicenseLevel', nullable: true })
  minLicenseLevel!: LicenseLevel | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  defaultWorkflowTemplateId!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
}

export class CreateDocumentTypeDto {
  @ApiProperty({ example: 'DWG', description: 'Used in document numbers; fixed after creation' })
  @Transform(upperCode)
  @Matches(/^[A-Z0-9]{1,10}$/)
  code!: string;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) nameTh!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) nameEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresPdfRendition?: boolean;
  @ApiPropertyOptional({ description: 'BR-DOC-040' })
  @IsOptional()
  @IsBoolean()
  requiresLicensedApprover?: boolean;

  @ApiPropertyOptional({ enum: LicenseBranch, enumName: 'LicenseBranch', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(LicenseBranch, { each: true })
  allowedLicenseBranches?: LicenseBranch[];

  @ApiPropertyOptional({ enum: LicenseLevel, enumName: 'LicenseLevel', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsEnum(LicenseLevel)
  minLicenseLevel?: LicenseLevel | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  defaultWorkflowTemplateId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateDocumentTypeDto extends PartialType(OmitType(CreateDocumentTypeDto, ['code'])) {}

// ───────────── workflow templates ─────────────

export class WorkflowStepInputDto {
  @ApiProperty({ minimum: 1, description: 'Same stepOrder = parallel group (BR-DOC-031)' })
  @IsInt()
  @Min(1)
  @Max(20)
  stepOrder!: number;

  @ApiProperty({ enum: ReviewStepKind, enumName: 'ReviewStepKind' })
  @IsEnum(ReviewStepKind)
  kind!: ReviewStepKind;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name!: string;

  @ApiPropertyOptional({ enum: ProjectRole, enumName: 'ProjectRole', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ProjectRole, { each: true })
  allowedProjectRoles?: ProjectRole[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresSignature?: boolean;
  @ApiPropertyOptional({ description: 'APPROVE steps only (BR-DOC-040)' })
  @IsOptional()
  @IsBoolean()
  requiresLicense?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 60, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  dueDays?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isOptional?: boolean;
}

export class WorkflowStepDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() stepOrder!: number;
  @ApiProperty({ enum: ReviewStepKind, enumName: 'ReviewStepKind' }) kind!: ReviewStepKind;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ProjectRole, enumName: 'ProjectRole', isArray: true })
  allowedProjectRoles!: ProjectRole[];
  @ApiProperty() requiresSignature!: boolean;
  @ApiProperty() requiresLicense!: boolean;
  @ApiProperty() dueDays!: number;
  @ApiProperty() isOptional!: boolean;
}

export class WorkflowTemplateDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [WorkflowStepDto] }) steps!: WorkflowStepDto[];
}

export class CreateWorkflowTemplateDto {
  @ApiProperty({ example: 'CHECK_APPROVE' })
  @Transform(upperCode)
  @Matches(/^[A-Z0-9_]{2,40}$/)
  code!: string;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiProperty({ type: [WorkflowStepInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepInputDto)
  steps!: WorkflowStepInputDto[];
}

export class UpdateWorkflowTemplateDto extends PartialType(
  OmitType(CreateWorkflowTemplateDto, ['code']),
) {}
