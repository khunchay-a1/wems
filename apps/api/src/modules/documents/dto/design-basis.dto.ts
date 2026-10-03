import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  DesignBasisStatus,
  DesignValueSource,
  LimitComparator,
} from '../../../generated/prisma/enums';
import { BlockedActionDto, UserRefDto } from '../../../common/http/common.dto';
import { emptyToNull, trim } from '../../../common/http/transforms';
import { SignatureInputDto } from './revisions.dto';

const DECIMAL = /^-?\d{1,14}(\.\d{1,10})?$/;
const DEC_MSG = 'decimal string, e.g. "250.5"';

function DecimalField(description: string): PropertyDecorator {
  return (target, key) => {
    ApiPropertyOptional({ type: String, nullable: true, example: '250.5', description })(
      target,
      key,
    );
    IsOptional()(target, key);
    Transform(emptyToNull)(target, key);
    Matches(DECIMAL, { message: DEC_MSG })(target, key);
  };
}

// ───────────── requests ─────────────

export class DesignBasisItemInputDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  parameterId?: string | null;
  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
  @ApiProperty({ maxLength: 40 }) @Transform(trim) @IsString() @MaxLength(40) unit!: string;
  @DecimalField('Influent design value') influentValue?: string | null;
  @DecimalField('Influent minimum') influentMin?: string | null;
  @DecimalField('Influent maximum') influentMax?: string | null;
  @DecimalField('Target effluent value') targetEffluentValue?: string | null;
  @ApiProperty({ enum: DesignValueSource, enumName: 'DesignValueSource' })
  @IsEnum(DesignValueSource)
  source!: DesignValueSource;
  @ApiPropertyOptional({ maxLength: 1000, nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  sourceNote?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Lab tests (phase 3, BR-DOC-082)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  sampleTestIds?: string[];
}

export class CreateDesignBasisDto {
  @ApiPropertyOptional({ maxLength: 200, description: 'Default: copied from the latest revision' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}

export class UpdateDesignBasisDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @DecimalField('Average flow (m³/day)') averageFlowM3PerDay?: string | null;
  @DecimalField('Peak factor') peakFactor?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 2000, maximum: 2200 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2200)
  designHorizonYear?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  populationEquivalent?: number | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  targetStandardId?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
  @ApiPropertyOptional({ type: [DesignBasisItemInputDto], description: 'Replaces the whole set' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DesignBasisItemInputDto)
  items?: DesignBasisItemInputDto[];
}

export class ApproveDesignBasisDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({
    type: SignatureInputDto,
    description: 'Required (DOC_SIGNATURE_REQUIRED)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SignatureInputDto)
  signature?: SignatureInputDto;
}

// ───────────── responses ─────────────

export class StandardLimitDto {
  @ApiProperty({ format: 'uuid' }) parameterId!: string;
  @ApiProperty({ enum: LimitComparator, enumName: 'LimitComparator' }) comparator!: LimitComparator;
  @ApiProperty({ nullable: true, type: String }) minValue!: string | null;
  @ApiProperty({ nullable: true, type: String }) maxValue!: string | null;
  @ApiProperty() unit!: string;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
}

export class DesignBasisItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) parameterId!: string | null;
  @ApiProperty({ nullable: true, type: String }) parameterCode!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ nullable: true, type: String }) influentValue!: string | null;
  @ApiProperty({ nullable: true, type: String }) influentMin!: string | null;
  @ApiProperty({ nullable: true, type: String }) influentMax!: string | null;
  @ApiProperty({ nullable: true, type: String }) targetEffluentValue!: string | null;
  @ApiProperty({ enum: DesignValueSource, enumName: 'DesignValueSource' })
  source!: DesignValueSource;
  @ApiProperty({ nullable: true, type: String }) sourceNote!: string | null;
  @ApiProperty({ type: [String] }) sampleTestIds!: string[];
  @ApiProperty({
    type: StandardLimitDto,
    nullable: true,
    description: 'Limit of the target standard',
  })
  standardLimit!: StandardLimitDto | null;
  @ApiProperty() sortOrder!: number;
}

export class DesignBasisSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() revNo!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: DesignBasisStatus, enumName: 'DesignBasisStatus' })
  status!: DesignBasisStatus;
  @ApiProperty({ nullable: true, type: String }) approvedAt!: string | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) approvedBy!: UserRefDto | null;
  @ApiProperty() itemCount!: number;
  @ApiProperty() updatedAt!: string;
}

export class DesignBasisDto extends DesignBasisSummaryDto {
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty({ nullable: true, type: String }) averageFlowM3PerDay!: string | null;
  @ApiProperty({ nullable: true, type: String }) peakFactor!: string | null;
  @ApiProperty({ nullable: true, type: Number }) designHorizonYear!: number | null;
  @ApiProperty({ nullable: true, type: Number }) populationEquivalent!: number | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) targetStandardId!: string | null;
  @ApiProperty({ nullable: true, type: String }) targetStandardName!: string | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ type: UserRefDto, nullable: true }) createdBy!: UserRefDto | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) signatureEventId!: string | null;
  @ApiProperty({ type: [DesignBasisItemDto] }) items!: DesignBasisItemDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [String] }) allowedActions!: string[];
  @ApiProperty({ type: [BlockedActionDto] }) blockedActions!: BlockedActionDto[];
}

export class ParameterRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() defaultUnit!: string;
  @ApiProperty() category!: string;
}

export class StandardRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() nameTh!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ nullable: true, type: String }) subtype!: string | null;
}
