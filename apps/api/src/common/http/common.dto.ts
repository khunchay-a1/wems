import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** Body field for optimistic locking on PATCH/actions (docs/03-data-model.md §6). */
export class VersionDto {
  @ApiProperty({ minimum: 1, description: 'version the client last saw' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class VersionQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class VersionReasonDto extends VersionDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class OptionalReasonDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** `{ id, displayName }` reference to a user (docs/04-api-conventions.md §7). */
export class UserRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;
}

/** Blocked action with the reason code the UI translates (docs/04-api-conventions.md §7). */
export class BlockedActionDto {
  @ApiProperty()
  action!: string;

  @ApiProperty()
  code!: string;
}
