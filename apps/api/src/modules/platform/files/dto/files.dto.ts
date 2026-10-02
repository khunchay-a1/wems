import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AttachmentOwnerType, FileStatus } from '../../../../generated/prisma/enums';
import { USER_UPLOAD_PURPOSES } from '../../../../common/files/file-purposes';

export class CreateUploadRequestDto {
  @ApiProperty({ example: 'แบบ ถังตกตะกอน Rev.A.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalName!: string;
  @ApiProperty({ example: 'application/pdf' }) @IsString() @MaxLength(200) mimeType!: string;
  @ApiProperty({ example: 1048576 }) @Type(() => Number) @IsInt() @Min(1) sizeBytes!: number;
  @ApiProperty({ enum: USER_UPLOAD_PURPOSES, enumName: 'FilePurpose' })
  @IsIn(USER_UPLOAD_PURPOSES)
  purpose!: (typeof USER_UPLOAD_PURPOSES)[number];
}

export class UploadUrlDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty({ enum: ['PUT'] }) method!: 'PUT';
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) headers!: Record<
    string,
    string
  >;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

export class FileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ nullable: true, type: String }) sha256!: string | null;
  @ApiProperty({ enum: FileStatus, enumName: 'FileStatus' }) status!: FileStatus;
  @ApiProperty({ nullable: true, type: Number }) pageCount!: number | null;
  @ApiProperty() hasPreview!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) processedAt!: string | null;
  @ApiProperty({ format: 'uuid' }) uploadedById!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Why the worker rejected the file' })
  rejectReason!: string | null;
}

export class SignedUrlDto {
  @ApiProperty() url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

export class AttachmentQueryDto {
  @ApiProperty({ enum: AttachmentOwnerType, enumName: 'AttachmentOwnerType' })
  @IsEnum(AttachmentOwnerType)
  ownerType!: AttachmentOwnerType;
  @ApiProperty({ format: 'uuid' }) @IsUUID() ownerId!: string;
}

export class CreateAttachmentDto extends AttachmentQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Client-generated UUIDv7 (offline) — idempotent',
  })
  @IsOptional()
  @IsUUID()
  id?: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() fileId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) caption?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601() takenAt?: string;
  @ApiPropertyOptional({ type: String, example: '13.756331' })
  @IsOptional()
  @IsLatitude()
  latitude?: string;
  @ApiPropertyOptional({ type: String, example: '100.501762' })
  @IsOptional()
  @IsLongitude()
  longitude?: string;
}

export class AttachmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: AttachmentOwnerType, enumName: 'AttachmentOwnerType' })
  ownerType!: AttachmentOwnerType;
  @ApiProperty({ format: 'uuid' }) ownerId!: string;
  @ApiProperty({ type: FileDto }) file!: FileDto;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) takenAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) latitude!: string | null;
  @ApiProperty({ nullable: true, type: String }) longitude!: string | null;
  @ApiProperty({ format: 'uuid' }) createdById!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
