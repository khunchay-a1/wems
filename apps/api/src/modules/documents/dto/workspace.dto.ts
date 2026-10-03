import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  ClientReturnCode,
  DocumentStatus,
  ProjectStatus,
  PurposeCode,
} from '../../../generated/prisma/enums';
import { trim } from '../../../common/http/transforms';
import { MyReviewStepDto } from './revisions.dto';

export class SearchQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

export class ReportQueryDto {
  @ApiPropertyOptional({ enum: ['xlsx', 'pdf'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['xlsx', 'pdf'])
  format?: 'xlsx' | 'pdf';
}

export class SearchDocumentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() projectCode!: string;
  @ApiProperty() number!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: DocumentStatus, enumName: 'DocumentStatus' }) status!: DocumentStatus;
  @ApiProperty({ nullable: true, type: String }) currentRevLabel!: string | null;
}

export class SearchProjectDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ProjectStatus, enumName: 'ProjectStatus' }) status!: ProjectStatus;
  @ApiProperty() clientName!: string;
}

export class SearchClientDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
}

export class SearchResultDto {
  @ApiProperty({ type: [SearchDocumentDto] }) documents!: SearchDocumentDto[];
  @ApiProperty({ type: [SearchProjectDto] }) projects!: SearchProjectDto[];
  @ApiProperty({ type: [SearchClientDto] }) clients!: SearchClientDto[];
}

export class WorkCommentDto {
  @ApiProperty({ format: 'uuid' }) commentId!: string;
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() documentNumber!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty() body!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() createdAt!: string;
}

export class WorkRevisionDto {
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() documentNumber!: string;
  @ApiProperty() documentTitle!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ enum: ClientReturnCode, enumName: 'ClientReturnCode', nullable: true })
  clientReturnCode!: ClientReturnCode | null;
  @ApiProperty({ nullable: true, type: String, description: 'When it was returned' })
  at!: string | null;
}

export class MyWorkDto {
  @ApiProperty({ type: [MyReviewStepDto], description: 'Up to 5, by due date' })
  reviews!: MyReviewStepDto[];
  @ApiProperty() reviewCount!: number;
  @ApiProperty() overdueReviewCount!: number;
  @ApiProperty({ type: [WorkCommentDto], description: 'OPEN review comments on my revisions' })
  commentsToAnswer!: WorkCommentDto[];
  @ApiProperty() commentsToAnswerCount!: number;
  @ApiProperty({ type: [WorkRevisionDto], description: 'My revisions returned for revision' })
  returned!: WorkRevisionDto[];
  @ApiProperty({ type: [WorkRevisionDto], description: 'CODE_3/CODE_4 on documents I own' })
  clientReturns!: WorkRevisionDto[];
}

export class MonthlyPlanDto {
  @ApiProperty({ example: '2026-10' }) month!: string;
  @ApiProperty() planned!: number;
  @ApiProperty() actual!: number;
}

export class DocumentStatsDto {
  @ApiProperty() documentCount!: number;
  @ApiProperty({ type: Object, description: 'RevisionStatus (or NO_REVISION) → count' })
  byRevisionStatus!: Record<string, number>;
  @ApiProperty() activeReviews!: number;
  @ApiProperty() overdueReviews!: number;
  @ApiProperty() openComments!: number;
  @ApiProperty() needsNewRevision!: number;
  @ApiProperty({ type: [MonthlyPlanDto], description: 'Planned vs actual deliveries per month' })
  monthly!: MonthlyPlanDto[];
}
