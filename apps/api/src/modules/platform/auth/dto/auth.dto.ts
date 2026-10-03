import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ClientPlatform } from '../../../../generated/prisma/enums';

export class LoginRequestDto {
  @ApiProperty({ example: 'somchai@company.co.th' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  @ApiProperty({ enum: ClientPlatform, enumName: 'ClientPlatform' })
  @IsEnum(ClientPlatform)
  platform!: ClientPlatform;

  @ApiPropertyOptional({ description: 'Stable device identifier (mobile)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;
}

export class MfaVerifyRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  mfaToken!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class RefreshRequestDto {
  @ApiPropertyOptional({ description: 'Mobile only — web sends the wems_rt cookie' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class LogoutRequestDto extends RefreshRequestDto {}

export class ChangePasswordRequestDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MaxLength(256)
  currentPassword!: string;

  @ApiProperty({ format: 'password', minLength: 12 })
  @IsString()
  @MaxLength(256)
  newPassword!: string;
}

export class PasswordConfirmDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MaxLength(256)
  password!: string;
}

export class MfaEnableRequestDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class MfaDisableRequestDto extends PasswordConfirmDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class SigningPinRequestDto extends PasswordConfirmDto {
  @ApiProperty({ example: '482913', description: '6 digits' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pin!: string;
}

export class MfaSetupResponseDto {
  @ApiProperty({ description: 'Base32 TOTP secret (show once)' })
  secret!: string;

  @ApiProperty()
  otpauthUrl!: string;
}

export class MeProjectDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'ProjectRole' })
  role!: string;
}

export class MeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'User row version (for PATCH /users/me)' })
  version!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayNameTh!: string;

  @ApiProperty({ nullable: true, type: String })
  displayNameEn!: string | null;

  @ApiProperty({ nullable: true, type: String })
  position!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  departmentId!: string | null;

  @ApiProperty({ example: 'th' })
  locale!: string;

  @ApiProperty({ enum: ['BUDDHIST', 'GREGORIAN'], enumName: 'CalendarPreference' })
  calendar!: 'BUDDHIST' | 'GREGORIAN';

  @ApiProperty()
  mfaEnabled!: boolean;

  @ApiProperty({
    description: 'A role requires MFA but it is not enabled yet — the UI must start setup',
  })
  mfaSetupRequired!: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty()
  hasSigningPin!: boolean;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty({ type: [MeProjectDto] })
  projects!: MeProjectDto[];
}

export class LoginResponseDto {
  @ApiProperty()
  mfaRequired!: boolean;

  @ApiPropertyOptional({
    description: 'Present when mfaRequired — pass to /auth/mfa/verify (5 min)',
  })
  mfaToken?: string;

  @ApiPropertyOptional({ description: 'Mobile only (web receives cookies)' })
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Mobile only — store in secure storage' })
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'Access token lifetime in seconds' })
  expiresIn?: number;

  @ApiPropertyOptional({ type: MeDto })
  user?: MeDto;
}

export class SessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ClientPlatform, enumName: 'ClientPlatform' })
  platform!: ClientPlatform;

  @ApiProperty({ nullable: true, type: String })
  deviceName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  ip!: string | null;

  @ApiProperty({ nullable: true, type: String })
  userAgent!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  lastUsedAt!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty()
  current!: boolean;
}
