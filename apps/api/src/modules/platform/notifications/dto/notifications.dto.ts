import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ClientPlatform, NotificationChannel } from '../../../../generated/prisma/enums';

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ nullable: true, type: String }) entityType!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) entityId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) projectId!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Path inside the web app' }) link!:
    string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) readAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class NotificationListMetaDto {
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
  @ApiProperty() unreadCount!: number;
}

export class NotificationListDto {
  @ApiProperty({ type: [NotificationDto] }) data!: NotificationDto[];
  @ApiProperty({ type: NotificationListMetaDto }) meta!: NotificationListMetaDto;
}

export class NotificationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class UnreadCountDto {
  @ApiProperty() unreadCount!: number;
}

export class NotificationPreferenceDto {
  @ApiProperty() type!: string;
  @ApiProperty({ enum: NotificationChannel, enumName: 'NotificationChannel', isArray: true })
  channels!: NotificationChannel[];
  @ApiProperty({ enum: NotificationChannel, enumName: 'NotificationChannel', isArray: true })
  defaultChannels!: NotificationChannel[];
  @ApiProperty({ description: 'In-app cannot be turned off' }) mandatoryInApp!: boolean;
}

export class PreferenceInputDto {
  @ApiProperty() @IsString() @MaxLength(100) type!: string;
  @ApiProperty({ enum: NotificationChannel, enumName: 'NotificationChannel', isArray: true })
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[];
}

export class PutPreferencesDto {
  @ApiProperty({ type: [PreferenceInputDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PreferenceInputDto)
  preferences!: PreferenceInputDto[];
}

export class RegisterPushDeviceDto {
  @ApiProperty() @IsString() @MaxLength(4096) fcmToken!: string;
  @ApiProperty({ enum: ClientPlatform, enumName: 'ClientPlatform' })
  @IsEnum(ClientPlatform)
  platform!: ClientPlatform;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) deviceModel?: string;
}
