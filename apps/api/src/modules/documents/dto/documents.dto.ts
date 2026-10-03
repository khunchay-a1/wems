import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ClientReturnCode,
  Confidentiality,
  DocumentSource,
  DocumentStatus,
  PurposeCode,
  RevisionStatus,
} from '../../../generated/prisma/enums';
import { BlockedActionDto, UserRefDto } from '../../../common/http/common.dto';
import { PageQueryDto } from '../../../common/http/pagination';
import { emptyToNull, toBool, trim } from '../../../common/http/transforms';

export class ListDocumentsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() disciplineId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() documentTypeId?: string;
  @ApiPropertyOptional({ description: 'Comma separated DocumentStatus (default ACTIVE,ON_HOLD)' })
  @IsOptional()
  @IsString()
  status?: string;
  @ApiPropertyOptional({
    description: 'Comma separated status of the current revision; NONE = no revision',
  })
  @IsOptional()
  @IsString()
  revisionStatus?: string;
  @ApiPropertyOptional({ description: 'Comma separated purpose of the current revision' })
  @IsOptional()
  @IsString()
  purposeCode?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() ownerId?: string;
  @ApiPropertyOptional({
    description: 'Comma separated client return code of the latest issued revision',
  })
  @IsOptional()
  @IsString()
  clientReturnCode?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() hasOpenComments?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) tag?: string;
}

export class PlanInputDto {
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' })
  @IsEnum(PurposeCode)
  purposeCode!: PurposeCode;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsDateString({ strict: true })
  plannedDate?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsDateString({ strict: true })
  forecastDate?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date',
    description: 'Normally set by transmittals (BR-DOC-063)',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsDateString({ strict: true })
  actualDate?: string | null;
}

export class PutPlansDto {
  @ApiProperty({ type: [PlanInputDto] })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => PlanInputDto)
  plans!: PlanInputDto[];
}

class DocumentFields {
  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  titleEn?: string | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() disciplineId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() documentTypeId!: string;
  @ApiPropertyOptional({ enum: DocumentSource, enumName: 'DocumentSource' })
  @IsOptional()
  @IsEnum(DocumentSource)
  source?: DocumentSource;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  originator?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'BR-DOC-012' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  externalNumber?: string | null;
  @ApiPropertyOptional({ enum: Confidentiality, enumName: 'Confidentiality' })
  @IsOptional()
  @IsEnum(Confidentiality)
  confidentiality?: Confidentiality;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20)
  sheetSize?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(50)
  scale?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  ownerId?: string | null;
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Overrides the workflow of the document type',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  workflowTemplateId?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  remarks?: string | null;
}

export class FirstRevisionDto {
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' })
  @IsEnum(PurposeCode)
  purposeCode!: PurposeCode;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CreateDocumentDto extends DocumentFields {
  @ApiPropertyOptional({ type: [PlanInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => PlanInputDto)
  plans?: PlanInputDto[];

  @ApiPropertyOptional({
    type: FirstRevisionDto,
    description: 'Create the first revision right away',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FirstRevisionDto)
  firstRevision?: FirstRevisionDto;
}

export class UpdateDocumentDto extends PartialType(DocumentFields) {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({
    description: 'document.admin only, after an approved revision (BR-DOC-011)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  number?: string;
  @ApiPropertyOptional({
    description: 'Required for locked number/discipline/type changes (BR-DOC-011)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class DocumentActionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class SupersedeDocumentDto extends DocumentActionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() byDocumentId!: string;
}

// ───────────── responses ─────────────

export class CodeRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() nameEn!: string;
}

export class RevisionSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty() revIndex!: number;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ enum: RevisionStatus, enumName: 'RevisionStatus' }) status!: RevisionStatus;
  @ApiProperty({ enum: ClientReturnCode, enumName: 'ClientReturnCode', nullable: true })
  clientReturnCode!: ClientReturnCode | null;
  @ApiProperty({ nullable: true, type: String }) approvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) issuedAt!: string | null;
}

export class PlanDto {
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) plannedDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) forecastDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) actualDate!: string | null;
}

export class DocumentListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() number!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) titleEn!: string | null;
  @ApiProperty({ type: CodeRefDto }) discipline!: CodeRefDto;
  @ApiProperty({ type: CodeRefDto }) documentType!: CodeRefDto;
  @ApiProperty({ enum: DocumentStatus, enumName: 'DocumentStatus' }) status!: DocumentStatus;
  @ApiProperty({ enum: Confidentiality, enumName: 'Confidentiality' })
  confidentiality!: Confidentiality;
  @ApiProperty({ type: UserRefDto, nullable: true }) owner!: UserRefDto | null;
  @ApiProperty({ type: RevisionSummaryDto, nullable: true })
  currentRevision!: RevisionSummaryDto | null;
  @ApiProperty({ type: RevisionSummaryDto, nullable: true, description: 'ฉบับใช้งาน' })
  latestApprovedRevision!: RevisionSummaryDto | null;
  @ApiProperty({ description: 'BR-DOC-064: client returned CODE_3/4 and no newer revision yet' })
  needsNewRevision!: boolean;
  @ApiProperty() openCommentCount!: number;
  @ApiProperty({ type: [PlanDto] }) plans!: PlanDto[];
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() updatedAt!: string;
  @ApiProperty() version!: number;
}

export class DocumentDto extends DocumentListItemDto {
  @ApiProperty({ enum: DocumentSource, enumName: 'DocumentSource' }) source!: DocumentSource;
  @ApiProperty({ nullable: true, type: String }) originator!: string | null;
  @ApiProperty({ nullable: true, type: String }) externalNumber!: string | null;
  @ApiProperty({ nullable: true, type: String }) sheetSize!: string | null;
  @ApiProperty({ nullable: true, type: String }) scale!: string | null;
  @ApiProperty({ nullable: true, type: String }) remarks!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) workflowTemplateId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) supersededByDocumentId!:
    string | null;
  @ApiProperty({ type: [RevisionSummaryDto] }) revisions!: RevisionSummaryDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [String], example: ['edit', 'newRevision', 'hold'] })
  allowedActions!: string[];
  @ApiProperty({ type: [BlockedActionDto] }) blockedActions!: BlockedActionDto[];
}

export class DocumentWarningDto {
  @ApiProperty({ example: 'DOC_TITLE_EXISTS' }) code!: string;
  @ApiProperty({ type: [String] }) documents!: string[];
}

export class SaveDocumentResultDto extends DocumentDto {
  @ApiProperty({ type: [DocumentWarningDto] }) warnings!: DocumentWarningDto[];
}

export class NumberPreviewDto {
  @ApiProperty({ example: 'P26-001-PR-DWG-003' }) number!: string;
}

export class NumberPreviewQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() disciplineId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() documentTypeId!: string;
}
