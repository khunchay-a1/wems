import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BuildingClass, ClientType, SiteType } from '../../../generated/prisma/enums';
import { BlockedActionDto } from '../../../common/http/common.dto';
import { PageQueryDto } from '../../../common/http/pagination';
import { emptyToNull, toBool, trim, upperCode } from '../../../common/http/transforms';

// ───────────────────────── clients ─────────────────────────

export class ListClientsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Comma separated ClientType values' })
  @IsOptional()
  @IsString()
  clientType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;
}

class ClientFields {
  @ApiProperty({ maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  nameTh!: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  nameEn?: string | null;

  @ApiPropertyOptional({ enum: ClientType, enumName: 'ClientType' })
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;

  @ApiPropertyOptional({
    description: '13-digit Thai taxpayer id (BR-CRM-002)',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(13)
  taxId?: string | null;

  @ApiPropertyOptional({ description: '"00000" = head office', nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsNumberString({ no_symbols: true })
  @MaxLength(5)
  branchCode?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  industry?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  addressLine?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  subdistrict?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  district?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  province?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\d{5}$/)
  postcode?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(50)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  website?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateClientDto extends ClientFields {
  @ApiPropertyOptional({
    description: 'BR-CRM-001 [A-Z0-9-]{2,12}; omitted = proposed from the English name',
    example: 'SWS',
  })
  @IsOptional()
  @Transform(upperCode)
  @Matches(/^[A-Z0-9-]{2,12}$/)
  code?: string;
}

export class UpdateClientDto extends PartialType(ClientFields) {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ClientDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ enum: ClientType, enumName: 'ClientType' }) clientType!: ClientType;
  @ApiProperty({ nullable: true, type: String }) taxId!: string | null;
  @ApiProperty({ nullable: true, type: String }) branchCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) industry!: string | null;
  @ApiProperty({ nullable: true, type: String }) addressLine!: string | null;
  @ApiProperty({ nullable: true, type: String }) subdistrict!: string | null;
  @ApiProperty({ nullable: true, type: String }) district!: string | null;
  @ApiProperty({ nullable: true, type: String }) province!: string | null;
  @ApiProperty({ nullable: true, type: String }) postcode!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ nullable: true, type: String }) website!: string | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'Projects not CLOSED/CANCELLED/COMPLETED' })
  openProjectCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [String], example: ['edit', 'deactivate'] }) allowedActions!: string[];
  @ApiProperty({ type: [BlockedActionDto] }) blockedActions!: BlockedActionDto[];
}

/** Created client plus non-blocking warnings (BR-CRM-002 duplicate taxId + branch). */
export class ClientWarningDto {
  @ApiProperty({ example: 'CLIENT_TAX_ID_EXISTS' }) code!: string;
  @ApiProperty({ type: [String], description: 'Codes of the clients that already use it' })
  clients!: string[];
}

export class SaveClientResultDto extends ClientDto {
  @ApiProperty({ type: [ClientWarningDto] }) warnings!: ClientWarningDto[];
}

export class ClientProjectRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
}

export class ClientSummaryDto {
  @ApiProperty() projectCount!: number;
  @ApiProperty() openProjectCount!: number;
  @ApiProperty() siteCount!: number;
  @ApiProperty() contactCount!: number;
  @ApiProperty() labJobCount!: number;
  @ApiProperty() quotationCount!: number;
  @ApiProperty({ type: [ClientProjectRefDto] }) recentProjects!: ClientProjectRefDto[];
}

export class ClientCodeSuggestionQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) nameEn?: string;
}

export class ClientCodeSuggestionDto {
  @ApiProperty({ example: 'SWS' }) code!: string;
}

// ───────────────────────── contacts ─────────────────────────

class ContactFields {
  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  position?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  department?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(50)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;
  @ApiPropertyOptional({ description: 'BR-CRM-004 one primary contact per client' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() receivesTransmittals?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() receivesLabReports?: boolean;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateContactDto extends ContactFields {}

export class UpdateContactDto extends PartialType(ContactFields) {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ContactDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) clientId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) position!: string | null;
  @ApiProperty({ nullable: true, type: String }) department!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() receivesTransmittals!: boolean;
  @ApiProperty() receivesLabReports!: boolean;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'Personal data removed (BR-CRM-007)' }) isAnonymized!: boolean;
  @ApiProperty() version!: number;
}

// ───────────────────────── sites ─────────────────────────

class SiteFields {
  @ApiProperty({ maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name!: string;
  @ApiProperty({ enum: SiteType, enumName: 'SiteType' }) @IsEnum(SiteType) siteType!: SiteType;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  addressLine?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  subdistrict?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  district?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  province?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\d{5}$/)
  postcode?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number, minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({ enum: BuildingClass, enumName: 'BuildingClass', nullable: true })
  @IsOptional()
  @IsEnum(BuildingClass)
  buildingClass?: BuildingClass | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  factoryRegistrationNo?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(50)
  factoryTypeCode?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Omitted for a BUILDING with a class → proposed BLD-2548-<class> (BR-CRM-006)',
  })
  @IsOptional()
  @IsUUID()
  defaultStandardId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateSiteDto extends SiteFields {
  @ApiProperty({ example: 'PLANT-1', description: 'Unique within the client (BR-CRM-005)' })
  @Transform(upperCode)
  @Matches(/^[A-Z0-9-]{1,20}$/)
  code!: string;
}

export class UpdateSiteDto extends PartialType(SiteFields) {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class StandardRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
}

export class SiteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) clientId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: SiteType, enumName: 'SiteType' }) siteType!: SiteType;
  @ApiProperty({ nullable: true, type: String }) addressLine!: string | null;
  @ApiProperty({ nullable: true, type: String }) subdistrict!: string | null;
  @ApiProperty({ nullable: true, type: String }) district!: string | null;
  @ApiProperty({ nullable: true, type: String }) province!: string | null;
  @ApiProperty({ nullable: true, type: String }) postcode!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Decimal(9,6) as string' }) latitude!:
    string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Decimal(9,6) as string' }) longitude!:
    string | null;
  @ApiProperty({ enum: BuildingClass, enumName: 'BuildingClass', nullable: true })
  buildingClass!: BuildingClass | null;
  @ApiProperty({ nullable: true, type: String }) factoryRegistrationNo!: string | null;
  @ApiProperty({ nullable: true, type: String }) factoryTypeCode!: string | null;
  @ApiProperty({ type: StandardRefDto, nullable: true }) defaultStandard!: StandardRefDto | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() version!: number;
}

export class ListSitesQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}
