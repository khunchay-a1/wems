import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ClientReturnCode,
  DocumentFileRole,
  LicenseBranch,
  LicenseLevel,
  ProjectRole,
  PurposeCode,
  ReviewCycleStatus,
  ReviewStepKind,
  ReviewStepStatus,
  RevisionStatus,
} from '../../../generated/prisma/enums';
import { BlockedActionDto, UserRefDto } from '../../../common/http/common.dto';
import { toBool, trim } from '../../../common/http/transforms';
import { FileDto } from '../../platform/files/dto/files.dto';

// ───────────── requests ─────────────

export class CreateRevisionDto {
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' })
  @IsEnum(PurposeCode)
  purposeCode!: PurposeCode;
  @ApiPropertyOptional({
    description: 'What changed (required from the 2nd revision before submit — BR-DOC-027)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({ description: 'document.admin only (BR-DOC-024)', example: 'C' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9]{1,6}$/)
  revLabelOverride?: string;
}

export class UpdateRevisionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({
    enum: PurposeCode,
    enumName: 'PurposeCode',
    description: 'Before the first submit only; recomputes the label',
  })
  @IsOptional()
  @IsEnum(PurposeCode)
  purposeCode?: PurposeCode;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class AddRevisionFileDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() fileId!: string;
  @ApiProperty({ enum: DocumentFileRole, enumName: 'DocumentFileRole' })
  @IsEnum(DocumentFileRole)
  role!: DocumentFileRole;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) note?: string;
}

export class VersionReasonBodyDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class DownloadQueryDto {
  @ApiPropertyOptional({
    enum: DocumentFileRole,
    enumName: 'DocumentFileRole',
    default: 'PDF_RENDITION',
  })
  @IsOptional()
  @IsEnum(DocumentFileRole)
  fileRole?: DocumentFileRole;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A specific DocumentFile (default: current file of the role)',
  })
  @IsOptional()
  @IsUUID()
  documentFileId?: string;
  @ApiPropertyOptional({ default: true, description: 'false needs document.edit (BR-DOC-071)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  stamp?: boolean;
}

export class SignatureInputDto {
  @ApiProperty({ enum: ['PASSWORD', 'SIGNING_PIN'] }) @IsIn(['PASSWORD', 'SIGNING_PIN']) method!:
    'PASSWORD' | 'SIGNING_PIN';
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) secret!: string;
}

export class SubmitStepDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() templateStepId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() assigneeId!: string;
}

export class SubmitRevisionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Default: document override, else the document type default',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string;
  @ApiProperty({
    type: [SubmitStepDto],
    description: 'Several entries per template step = parallel assignees',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SubmitStepDto)
  steps!: SubmitStepDto[];
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) note?: string;
}

export class DecisionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED'] })
  @IsIn(['APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED'])
  decision!: 'APPROVED' | 'APPROVED_WITH_COMMENTS' | 'REJECTED';
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) note?: string;
  @ApiPropertyOptional({
    type: SignatureInputDto,
    description: 'Required when the step requires a signature (BR-DOC-043)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SignatureInputDto)
  signature?: SignatureInputDto;
}

export class ReassignDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ format: 'uuid' }) @IsUUID() assigneeId!: string;
  @ApiProperty({ minLength: 3 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class ReviewStepsQueryDto {
  @ApiPropertyOptional({ description: '"me" (default) or a user id (PM/document.admin)' })
  @IsOptional()
  @IsString()
  assigneeId?: string;
  @ApiPropertyOptional({ description: 'Comma separated ReviewStepStatus (default ACTIVE)' })
  @IsOptional()
  @IsString()
  status?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;
}

export class EligibleQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() templateId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() templateStepId?: string;
}

// ───────────── responses ─────────────

export class DocumentFileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: DocumentFileRole, enumName: 'DocumentFileRole' }) role!: DocumentFileRole;
  @ApiProperty() uploadVersion!: number;
  @ApiProperty() isCurrent!: boolean;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ type: UserRefDto }) uploadedBy!: UserRefDto;
  @ApiProperty() uploadedAt!: string;
  @ApiProperty({ type: FileDto }) file!: FileDto;
}

export class ReviewStepDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() stepOrder!: number;
  @ApiProperty({ enum: ReviewStepKind, enumName: 'ReviewStepKind' }) kind!: ReviewStepKind;
  @ApiProperty() name!: string;
  @ApiProperty({ type: UserRefDto }) assignee!: UserRefDto;
  @ApiProperty({ enum: ReviewStepStatus, enumName: 'ReviewStepStatus' }) status!: ReviewStepStatus;
  @ApiProperty() requiresSignature!: boolean;
  @ApiProperty() requiresLicense!: boolean;
  @ApiProperty() isOptional!: boolean;
  @ApiProperty({ nullable: true, type: String }) activatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) dueAt!: string | null;
  @ApiProperty() isOverdue!: boolean;
  @ApiProperty({ nullable: true, type: String }) decidedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) decisionNote!: string | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) delegatedFrom!: UserRefDto | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) signatureEventId!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [String], example: ['decide', 'reassign'] }) allowedActions!: string[];
}

export class ReviewCycleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty() cycleNo!: number;
  @ApiProperty({ enum: ReviewCycleStatus, enumName: 'ReviewCycleStatus' })
  status!: ReviewCycleStatus;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) templateId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) reviewedFileId!: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewedFileSha256!: string | null;
  @ApiProperty({ type: UserRefDto }) submittedBy!: UserRefDto;
  @ApiProperty() submittedAt!: string;
  @ApiProperty({ nullable: true, type: String }) submitNote!: string | null;
  @ApiProperty({ nullable: true, type: String }) completedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) cancelledReason!: string | null;
  @ApiProperty({ type: [ReviewStepDto] }) steps!: ReviewStepDto[];
}

export class RevisionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() documentNumber!: string;
  @ApiProperty() documentTitle!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty() revIndex!: number;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ enum: RevisionStatus, enumName: 'RevisionStatus' }) status!: RevisionStatus;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ type: UserRefDto }) preparedBy!: UserRefDto;
  @ApiProperty({ type: UserRefDto, nullable: true }) checkedBy!: UserRefDto | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) approvedBy!: UserRefDto | null;
  @ApiProperty({ nullable: true, type: String }) approvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) issuedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) lockedAt!: string | null;
  @ApiProperty({ enum: ReviewCycleStatus, enumName: 'ReviewCycleStatus', nullable: true })
  lastCycleOutcome!: ReviewCycleStatus | null;
  @ApiProperty({ enum: ClientReturnCode, enumName: 'ClientReturnCode', nullable: true })
  clientReturnCode!: ClientReturnCode | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) clientReturnedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) voidedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) voidReason!: string | null;
  @ApiProperty() isLatestApproved!: boolean;
  @ApiProperty({ type: [DocumentFileDto], description: 'All uploads, newest first' })
  files!: DocumentFileDto[];
  @ApiProperty({ type: [ReviewCycleDto], description: 'Newest first' }) cycles!: ReviewCycleDto[];
  @ApiProperty() commentCount!: number;
  @ApiProperty() openCommentCount!: number;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [String], example: ['upload', 'submit', 'discard'] })
  allowedActions!: string[];
  @ApiProperty({ type: [BlockedActionDto] }) blockedActions!: BlockedActionDto[];
}

export class SignedUrlResultDto {
  @ApiProperty() url!: string;
  @ApiProperty() expiresAt!: string;
}

export class LicenseBadgeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() licenseNo!: string;
  @ApiProperty({ enum: LicenseBranch, enumName: 'LicenseBranch' }) branch!: LicenseBranch;
  @ApiProperty({ enum: LicenseLevel, enumName: 'LicenseLevel' }) level!: LicenseLevel;
  @ApiProperty({ format: 'date' }) expiresAt!: string;
}

export class EligibleReviewerDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) position!: string | null;
  @ApiProperty({ enum: ProjectRole, enumName: 'ProjectRole', nullable: true })
  projectRole!: ProjectRole | null;
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ nullable: true, type: String, example: 'DOC_SEPARATION_OF_DUTIES' }) reason!:
    string | null;
  @ApiProperty({ type: LicenseBadgeDto, nullable: true }) license!: LicenseBadgeDto | null;
  @ApiProperty({ description: 'The licence expires before the estimated due date (warning only)' })
  licenseExpiresBeforeDue!: boolean;
  @ApiProperty({
    description: 'Used for this step on the same document type in this project before',
  })
  suggested!: boolean;
}

export class EligibleStepDto {
  @ApiProperty({ format: 'uuid' }) templateStepId!: string;
  @ApiProperty() stepOrder!: number;
  @ApiProperty({ enum: ReviewStepKind, enumName: 'ReviewStepKind' }) kind!: ReviewStepKind;
  @ApiProperty() name!: string;
  @ApiProperty() isOptional!: boolean;
  @ApiProperty() requiresSignature!: boolean;
  @ApiProperty() needsLicense!: boolean;
  @ApiProperty() dueDays!: number;
  @ApiProperty({ description: 'Estimated due date if the step started now' })
  estimatedDueAt!: string;
  @ApiProperty({ type: [EligibleReviewerDto] }) candidates!: EligibleReviewerDto[];
}

export class EligibleReviewersDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) templateId!: string | null;
  @ApiProperty({ type: [EligibleStepDto] }) steps!: EligibleStepDto[];
}

export class SubmitResultDto extends RevisionDto {
  @ApiProperty({ type: [String], description: 'e.g. LICENSE_EXPIRES_BEFORE_DUE' })
  warnings!: string[];
}

export class MyReviewStepDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) cycleId!: string;
  @ApiProperty({ enum: ReviewStepKind, enumName: 'ReviewStepKind' }) kind!: ReviewStepKind;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ReviewStepStatus, enumName: 'ReviewStepStatus' }) status!: ReviewStepStatus;
  @ApiProperty({ nullable: true, type: String }) activatedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) dueAt!: string | null;
  @ApiProperty() isOverdue!: boolean;
  @ApiProperty() requiresSignature!: boolean;
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty() documentNumber!: string;
  @ApiProperty() documentTitle!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() projectCode!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty({ type: UserRefDto }) submittedBy!: UserRefDto;
  @ApiProperty() version!: number;
}
