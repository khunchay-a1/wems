import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ChangeOp,
  ClientReturnCode,
  Confidentiality,
  DocumentFileRole,
  DocumentStatus,
  ProjectRole,
  ProjectStatus,
  ProjectType,
  PurposeCode,
  ReviewCycleStatus,
  RevisionStatus,
} from '../../../generated/prisma/enums';

export class SyncPullQueryDto {
  @ApiProperty({ description: '`global` · `user:<my id>` · `project:<id>`', example: 'global' })
  @IsString()
  @MaxLength(60)
  scope!: string;

  @ApiPropertyOptional({ description: 'Opaque; omit for a snapshot' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000, default: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class SyncChangeDto {
  @ApiProperty({
    description:
      'Project · ProjectMember · Document · DocumentRevision · ReviewStep · Discipline · DocumentType',
  })
  entityType!: string;
  @ApiProperty({ enum: ChangeOp, enumName: 'ChangeOp' }) op!: ChangeOp;
  @ApiProperty({ description: 'Entity id (ProjectMember: the member user id)' }) id!: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'The matching *SyncDto when op = UPSERT',
  })
  data?: Record<string, unknown>;
}

export class SyncPullDto {
  @ApiProperty() scope!: string;
  @ApiProperty({ type: [SyncChangeDto] }) changes!: SyncChangeDto[];
  @ApiProperty() nextCursor!: string;
  @ApiProperty() hasMore!: boolean;
  @ApiProperty() serverTime!: string;
}

// ───────────── entity payloads (compact, mobile only) ─────────────

export class ProjectSyncDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ enum: ProjectType, enumName: 'ProjectType' }) type!: ProjectType;
  @ApiProperty({ enum: ProjectStatus, enumName: 'ProjectStatus' }) status!: ProjectStatus;
  @ApiProperty() clientName!: string;
  @ApiProperty({ nullable: true, type: String }) siteName!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) projectManagerId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) plannedEndDate!: string | null;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() version!: number;
}

export class ProjectMemberSyncDto {
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ enum: ProjectRole, enumName: 'ProjectRole' }) role!: ProjectRole;
  @ApiProperty() displayName!: string;
}

export class DocumentSyncDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() number!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) titleEn!: string | null;
  @ApiProperty({ format: 'uuid' }) disciplineId!: string;
  @ApiProperty({ format: 'uuid' }) documentTypeId!: string;
  @ApiProperty({ enum: DocumentStatus, enumName: 'DocumentStatus' }) status!: DocumentStatus;
  @ApiProperty({ enum: Confidentiality, enumName: 'Confidentiality' })
  confidentiality!: Confidentiality;
  @ApiProperty({ nullable: true, type: String }) ownerName!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) currentRevisionId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  latestApprovedRevisionId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  supersededByDocumentId!: string | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() updatedAt!: string;
  @ApiProperty() version!: number;
}

export class DocumentFileSyncDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: DocumentFileRole, enumName: 'DocumentFileRole' }) role!: DocumentFileRole;
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true, type: Number }) pageCount!: number | null;
}

export class DocumentRevisionSyncDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty() revIndex!: number;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ enum: RevisionStatus, enumName: 'RevisionStatus' }) status!: RevisionStatus;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() preparedByName!: string;
  @ApiProperty({ nullable: true, type: String }) approvedByName!: string | null;
  @ApiProperty({ nullable: true, type: String }) approvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) issuedAt!: string | null;
  @ApiProperty({ enum: ReviewCycleStatus, enumName: 'ReviewCycleStatus', nullable: true })
  lastCycleOutcome!: ReviewCycleStatus | null;
  @ApiProperty({ enum: ClientReturnCode, enumName: 'ClientReturnCode', nullable: true })
  clientReturnCode!: ClientReturnCode | null;
  @ApiProperty({ type: [DocumentFileSyncDto], description: 'Current files only' })
  files!: DocumentFileSyncDto[];
  @ApiProperty() updatedAt!: string;
  @ApiProperty() version!: number;
}

export class MasterItemSyncDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
}
