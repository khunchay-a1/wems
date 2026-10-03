import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CommentOwnerType, CommentStatus } from '../../../generated/prisma/enums';
import { BlockedActionDto, UserRefDto } from '../../../common/http/common.dto';
import { trim } from '../../../common/http/transforms';

/** Normalised 0..1 position on a PDF page from the top-left corner (docs/03-data-model.md §4). */
export class PdfAnchorDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) page!: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() @Min(0) @Max(1) x!: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() @Min(0) @Max(1) y!: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  w?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  h?: number;
  @ApiProperty({ enum: ['PIN', 'RECT'] }) @IsIn(['PIN', 'RECT']) kind!: 'PIN' | 'RECT';
}

export class ListCommentsQueryDto {
  @ApiProperty({ enum: CommentOwnerType, enumName: 'CommentOwnerType' })
  @IsEnum(CommentOwnerType)
  ownerType!: CommentOwnerType;
  @ApiProperty({ format: 'uuid' }) @IsUUID() ownerId!: string;
}

export class CreateCommentDto {
  @ApiProperty({ enum: CommentOwnerType, enumName: 'CommentOwnerType' })
  @IsEnum(CommentOwnerType)
  ownerType!: CommentOwnerType;
  @ApiProperty({ format: 'uuid' }) @IsUUID() ownerId!: string;
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
  @ApiPropertyOptional({ type: PdfAnchorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PdfAnchorDto)
  anchor?: PdfAnchorDto;
  @ApiPropertyOptional({ format: 'uuid', description: 'Reply to a top-level comment' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
  @ApiPropertyOptional({ type: [String], description: 'Mentioned user ids' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  mentions?: string[];
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Review comment of this ACTIVE step (BR-DOC-035) — becomes OPEN',
  })
  @IsOptional()
  @IsUUID()
  reviewStepId?: string;
}

export class UpdateCommentDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ minLength: 1, maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;
  @ApiPropertyOptional({ type: PdfAnchorDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => PdfAnchorDto)
  anchor?: PdfAnchorDto | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  mentions?: string[];
}

export class RespondCommentDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  responseNote!: string;
}

export class CommentStateDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ maxLength: 2000, description: 'Optional note added as a reply' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CommentDeleteQueryDto {
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) version!: number;
}

export class CrsQueryDto {
  @ApiPropertyOptional({ enum: ['pdf', 'xlsx'], default: 'pdf' })
  @IsOptional()
  @IsIn(['pdf', 'xlsx'])
  format?: 'pdf' | 'xlsx';
}

// ───────────── responses ─────────────

export class CommentReplyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: UserRefDto }) author!: UserRefDto;
  @ApiProperty() body!: string;
  @ApiProperty({ type: [String] }) mentions!: string[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [String] }) allowedActions!: string[];
}

export class CommentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Running number per owner (#1, #2 … by creation time)' })
  seq!: number;
  @ApiProperty({ enum: CommentOwnerType, enumName: 'CommentOwnerType' })
  ownerType!: CommentOwnerType;
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty({ type: UserRefDto }) author!: UserRefDto;
  @ApiProperty() body!: string;
  @ApiProperty({ type: [String] }) mentions!: string[];
  @ApiProperty({ type: PdfAnchorDto, nullable: true }) anchor!: PdfAnchorDto | null;
  @ApiProperty({ enum: CommentStatus, enumName: 'CommentStatus' }) status!: CommentStatus;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) reviewStepId!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Step name of a review comment' })
  stepName!: string | null;
  @ApiProperty({ nullable: true, type: Number }) cycleNo!: number | null;
  @ApiProperty({ nullable: true, type: String }) responseNote!: string | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) resolvedBy!: UserRefDto | null;
  @ApiProperty({ nullable: true, type: String }) resolvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Rev. label it was carried from' })
  carriedFromRevLabel!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  carriedFromCommentId!: string | null;
  @ApiProperty({ type: [CommentReplyDto] }) replies!: CommentReplyDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [String] }) allowedActions!: string[];
  @ApiProperty({ type: [BlockedActionDto] }) blockedActions!: BlockedActionDto[];
}
