import type { SchemaObject } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { NumberedEntity, SequenceReset } from '../../../../generated/prisma/enums';
import { PageQueryDto } from '../../../../common/http/pagination';

export class NumberingSchemeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: NumberedEntity, enumName: 'NumberedEntity' }) entity!: NumberedEntity;
  @ApiProperty({ description: '"GLOBAL" or "project:<uuid>"' }) scope!: string;
  @ApiProperty() pattern!: string;
  @ApiProperty({ enum: SequenceReset, enumName: 'SequenceReset' }) resetPolicy!: SequenceReset;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'Example of the next number with sample values' }) example!: string;
}

export class UpdateNumberingSchemeDto {
  @ApiProperty({ example: '{PROJECT}-{DISCIPLINE}-{TYPE}-{SEQ:3}' })
  @IsString()
  @MaxLength(100)
  pattern!: string;
  @ApiProperty({ enum: SequenceReset, enumName: 'SequenceReset' })
  @IsEnum(SequenceReset)
  resetPolicy!: SequenceReset;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PreviewNumberRequestDto {
  @ApiProperty({ enum: NumberedEntity, enumName: 'NumberedEntity' })
  @IsEnum(NumberedEntity)
  entity!: NumberedEntity;
  @ApiPropertyOptional({ description: 'Try a pattern before saving it' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pattern?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ example: 'PR' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  disciplineCode?: string;
  @ApiPropertyOptional({ example: 'DWG' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  typeCode?: string;
}

export class PreviewNumberDto {
  @ApiProperty() number!: string;
}

/** OpenAPI schema for an arbitrary JSON value (setting values differ per key). */
const ANY_JSON: { oneOf: SchemaObject[] } = {
  oneOf: [
    { type: 'object', additionalProperties: true },
    { type: 'array', items: {} },
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
  ],
};

export class SettingDto {
  @ApiProperty() key!: string;
  @ApiProperty({ description: 'JSON value (shape depends on the key — M01 §7)', ...ANY_JSON })
  value!: unknown;
}

export class PutSettingDto {
  @ApiProperty({ description: 'JSON value', ...ANY_JSON }) @IsDefined() value!: unknown;
}

const toDate = ({ value }: { value: unknown }) => value;

export class AuditLogQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) entityId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Action prefix, e.g. "auth."' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Transform(toDate)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  occurredFrom?: string;
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Transform(toDate)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  occurredTo?: string;
}

export class AuditLogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ enum: ['USER', 'SYSTEM', 'PUBLIC_LINK'], enumName: 'ActorType' })
  actorType!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) actorId!: string | null;
  @ApiProperty({ nullable: true, type: String }) actorName!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ nullable: true, type: String }) entityId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) projectId!: string | null;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ nullable: true, type: Object }) changes!: unknown;
  @ApiProperty({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({ nullable: true, type: String }) ip!: string | null;
  @ApiProperty({ nullable: true, type: String }) requestId!: string | null;
}

export class AppConfigDto {
  @ApiProperty({ example: { android: '1.0.0', ios: '1.0.0' } }) minSupportedVersion!: {
    android: string;
    ios: string;
  };
  @ApiProperty({ example: '1.0.0' }) latestVersion!: string;
  @ApiPropertyOptional() maintenanceMessage?: string;
  @ApiProperty() companyNameTh!: string;
  @ApiProperty() companyNameEn!: string;
}
