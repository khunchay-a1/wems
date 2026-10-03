import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ClientReturnCode,
  DeliveryMethod,
  PurposeCode,
  RevisionStatus,
  TransmittalFormat,
  TransmittalStatus,
} from '../../../generated/prisma/enums';
import { BlockedActionDto, UserRefDto } from '../../../common/http/common.dto';
import { PageQueryDto } from '../../../common/http/pagination';
import { emptyToNull, trim } from '../../../common/http/transforms';

const lower = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
    : value;

// ───────────── requests ─────────────

export class TransmittalItemInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() revisionId!: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 99, description: 'Default 1' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  copies?: number;
  @ApiPropertyOptional({
    enum: TransmittalFormat,
    enumName: 'TransmittalFormat',
    description: 'Default PDF',
  })
  @IsOptional()
  @IsEnum(TransmittalFormat)
  format?: TransmittalFormat;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  remark?: string;
}

class TransmittalHeaderDto {
  @ApiProperty({ minLength: 1, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' })
  @IsEnum(PurposeCode)
  purposeCode!: PurposeCode;
  @ApiProperty({ enum: DeliveryMethod, enumName: 'DeliveryMethod' })
  @IsEnum(DeliveryMethod)
  deliveryMethod!: DeliveryMethod;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  recipientClientId?: string | null;
  @ApiProperty({ minLength: 1, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  recipientName!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Transform(lower)
  @IsEmail({}, { each: true })
  recipientEmails?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Transform(lower)
  @IsEmail({}, { each: true })
  ccEmails?: string[];
  @ApiPropertyOptional({ maxLength: 5000, nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(5000)
  message?: string | null;
}

export class CreateTransmittalDto extends TransmittalHeaderDto {
  @ApiPropertyOptional({ type: [TransmittalItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TransmittalItemInputDto)
  items?: TransmittalItemInputDto[];
}

export class UpdateTransmittalDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject?: string;
  @ApiPropertyOptional({ enum: PurposeCode, enumName: 'PurposeCode' })
  @IsOptional()
  @IsEnum(PurposeCode)
  purposeCode?: PurposeCode;
  @ApiPropertyOptional({ enum: DeliveryMethod, enumName: 'DeliveryMethod' })
  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  recipientClientId?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  recipientName?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Transform(lower)
  @IsEmail({}, { each: true })
  recipientEmails?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Transform(lower)
  @IsEmail({}, { each: true })
  ccEmails?: string[];
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(5000)
  message?: string | null;
}

export class UpdateTransmittalItemDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  copies?: number;
  @ApiPropertyOptional({ enum: TransmittalFormat, enumName: 'TransmittalFormat' })
  @IsOptional()
  @IsEnum(TransmittalFormat)
  format?: TransmittalFormat;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}

export class TransmittalVersionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class CancelTransmittalDto extends TransmittalVersionDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class AcknowledgeDto extends TransmittalVersionDto {
  @ApiProperty({ format: 'date', description: 'Date the client received it (≥ sent date)' })
  @IsISO8601({ strict: true })
  acknowledgedAt!: string;
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Signed receipt scan' })
  @IsOptional()
  @IsUUID()
  fileId?: string;
}

export class ExtendLinkDto extends TransmittalVersionDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 365,
    description: 'Days from today (default setting)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class ClientResponseDto {
  @ApiProperty({ enum: ClientReturnCode, enumName: 'ClientReturnCode' })
  @IsEnum(ClientReturnCode)
  code!: ClientReturnCode;
  @ApiProperty({ format: 'date' }) @IsISO8601({ strict: true }) returnedAt!: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Client comment file (CLIENT_RESPONSE upload)',
  })
  @IsOptional()
  @IsUUID()
  fileId?: string;
}

export class ListTransmittalsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: TransmittalStatus, enumName: 'TransmittalStatus' })
  @IsOptional()
  @IsEnum(TransmittalStatus)
  status?: TransmittalStatus;
}

export class TransmittableQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
}

// ───────────── responses ─────────────

export class TransmittalItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty() documentNumber!: string;
  @ApiProperty() documentTitle!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ enum: RevisionStatus, enumName: 'RevisionStatus' })
  revisionStatus!: RevisionStatus;
  @ApiProperty({ description: 'BR-DOC-061: false when a newer approved revision exists' })
  isLatest!: boolean;
  @ApiProperty() copies!: number;
  @ApiProperty({ enum: TransmittalFormat, enumName: 'TransmittalFormat' })
  format!: TransmittalFormat;
  @ApiProperty({ nullable: true, type: String }) remark!: string | null;
  @ApiProperty({ description: 'Bytes of the files that go out for the format' }) sizeBytes!: number;
  @ApiProperty({ enum: ClientReturnCode, enumName: 'ClientReturnCode', nullable: true })
  clientReturnCode!: ClientReturnCode | null;
  @ApiProperty({ format: 'date', nullable: true, type: String }) clientReturnedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) clientResponseNote!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) clientCommentFileId!:
    string | null;
  @ApiProperty() sortOrder!: number;
}

export class TransmittalDownloadDto {
  @ApiProperty() downloadedAt!: string;
  @ApiProperty({ nullable: true, type: String }) fileName!: string | null;
  @ApiProperty({ nullable: true, type: String }) ip!: string | null;
}

export class TransmittalListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() number!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() recipientName!: string;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ enum: TransmittalStatus, enumName: 'TransmittalStatus' })
  status!: TransmittalStatus;
  @ApiProperty({ enum: DeliveryMethod, enumName: 'DeliveryMethod' })
  deliveryMethod!: DeliveryMethod;
  @ApiProperty({ nullable: true, type: String }) sentAt!: string | null;
  @ApiProperty() itemCount!: number;
  @ApiProperty({ description: 'Items with a client response' }) respondedCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() version!: number;
}

export class TransmittalDto extends TransmittalListItemDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) recipientClientId!: string | null;
  @ApiProperty({ type: [String] }) recipientEmails!: string[];
  @ApiProperty({ type: [String] }) ccEmails!: string[];
  @ApiProperty({ nullable: true, type: String }) message!: string | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) sentBy!: UserRefDto | null;
  @ApiProperty({ nullable: true, type: String }) acknowledgedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) acknowledgedNote!: string | null;
  @ApiProperty({ nullable: true, type: String }) cancelReason!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) coverSheetFileId!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Public download page (EMAIL_LINK)' })
  publicUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) linkExpiresAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) linkRevokedAt!: string | null;
  @ApiProperty() totalBytes!: number;
  @ApiProperty({ description: 'BR-DOC-062: attachments would exceed the limit → link' })
  willSendLink!: boolean;
  @ApiProperty() maxAttachmentMb!: number;
  @ApiProperty({ type: [TransmittalItemDto] }) items!: TransmittalItemDto[];
  @ApiProperty({ type: [TransmittalDownloadDto] }) downloads!: TransmittalDownloadDto[];
  @ApiProperty({ type: [String] }) allowedActions!: string[];
  @ApiProperty({ type: [BlockedActionDto] }) blockedActions!: BlockedActionDto[];
}

export class SendResultDto extends TransmittalDto {
  @ApiProperty({ type: [String], description: 'e.g. SWITCHED_TO_LINK, NOT_LATEST_REVISION' })
  warnings!: string[];
}

export class TransmittableRevisionDto {
  @ApiProperty({ format: 'uuid' }) revisionId!: string;
  @ApiProperty({ format: 'uuid' }) documentId!: string;
  @ApiProperty() documentNumber!: string;
  @ApiProperty() documentTitle!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty({ enum: PurposeCode, enumName: 'PurposeCode' }) purposeCode!: PurposeCode;
  @ApiProperty({ enum: RevisionStatus, enumName: 'RevisionStatus' }) status!: RevisionStatus;
  @ApiProperty() isLatest!: boolean;
  @ApiProperty() sizeBytes!: number;
}

// ───────────── public page (no login) ─────────────

export class PublicTransmittalItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() documentNumber!: string;
  @ApiProperty() documentTitle!: string;
  @ApiProperty() revLabel!: string;
  @ApiProperty({ type: [String] }) files!: string[];
}

export class PublicTransmittalDto {
  @ApiProperty() companyName!: string;
  @ApiProperty() number!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty() sentAt!: string;
  @ApiProperty() linkExpiresAt!: string;
  @ApiProperty() senderName!: string;
  @ApiProperty({ nullable: true, type: String }) senderEmail!: string | null;
  @ApiProperty() hasPackage!: boolean;
  @ApiProperty({ type: [PublicTransmittalItemDto] }) items!: PublicTransmittalItemDto[];
}

export class PublicDownloadDto {
  @ApiProperty() url!: string;
  @ApiProperty() expiresAt!: string;
}
