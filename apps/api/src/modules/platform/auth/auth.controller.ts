import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import {
  ACCESS_COOKIE_PATH,
  COOKIE_ACCESS,
  COOKIE_CSRF,
  COOKIE_REFRESH,
  REFRESH_COOKIE_PATH,
} from '../../../common/auth/cookies';
import { AllowPendingPasswordChange, CurrentUser } from '../../../common/auth/decorators';
import { Public } from '../../../common/auth/public.decorator';
import { TokenService } from '../../../common/auth/token.service';
import { AppConfig } from '../../../common/config/app-config';
import { randomToken } from '../../../common/crypto/crypto';
import { Problem } from '../../../common/errors/problem';
import { Op } from '../../../common/openapi/op.decorator';
import { ClockService } from '../../../common/time/clock';
import { AuthService, type IssuedSession } from './auth.service';
import {
  ChangePasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  LogoutRequestDto,
  MeDto,
  MfaDisableRequestDto,
  MfaEnableRequestDto,
  MfaSetupResponseDto,
  MfaVerifyRequestDto,
  PasswordConfirmDto,
  RefreshRequestDto,
  SessionDto,
  SigningPinRequestDto,
} from './dto/auth.dto';

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
    private readonly clock: ClockService,
  ) {}

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('login')
  @HttpCode(200)
  @Op('Auth', 'login', 'Sign in (web: sets cookies; mobile: returns tokens)')
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() dto: LoginRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const outcome = await this.auth.login(dto.email, dto.password, dto);
    if (outcome.kind === 'mfa') return { mfaRequired: true, mfaToken: outcome.mfaToken };
    return this.respondWithSession(outcome.session, res);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('mfa/verify')
  @HttpCode(200)
  @Op('Auth', 'verifyMfa', 'Complete sign-in with a TOTP code')
  @ApiOkResponse({ type: LoginResponseDto })
  async verifyMfa(
    @Body() dto: MfaVerifyRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    return this.respondWithSession(await this.auth.verifyMfa(dto.mfaToken, dto.code), res);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('refresh')
  @HttpCode(200)
  @Op('Auth', 'refreshToken', 'Rotate the refresh token (web: wems_rt cookie; mobile: body)')
  @ApiOkResponse({ type: LoginResponseDto })
  async refresh(
    @Body() dto: RefreshRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const token = dto.refreshToken ?? this.cookie(req, COOKIE_REFRESH);
    if (!token) throw new Problem('UNAUTHENTICATED');
    try {
      return await this.respondWithSession(await this.auth.refresh(token), res, false);
    } catch (err) {
      if (!dto.refreshToken) this.clearCookies(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @Op('Auth', 'logout', 'Sign out and revoke the session family')
  @ApiNoContentResponse()
  async logout(
    @Body() dto: LogoutRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const access =
      this.cookie(req, COOKIE_ACCESS) ?? req.headers.authorization?.replace(/^Bearer /, '');
    const verified = access ? this.tokens.verifyAccess(access) : null;
    const sessionId = verified?.ok ? verified.claims.sid : null;
    await this.auth.logout(sessionId, dto.refreshToken ?? this.cookie(req, COOKIE_REFRESH) ?? null);
    this.clearCookies(res);
  }

  @Get('me')
  @AllowPendingPasswordChange()
  @Op('Auth', 'getMe', 'Current user, roles, permissions and project memberships')
  @ApiOkResponse({ type: MeDto })
  me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @HttpCode(204)
  @AllowPendingPasswordChange()
  @Throttle(AUTH_LIMIT)
  @Op('Auth', 'changePassword', 'Change own password (other sessions are signed out)')
  @ApiNoContentResponse()
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordRequestDto,
  ): Promise<void> {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }

  @Post('mfa/setup')
  @HttpCode(200)
  @AllowPendingPasswordChange()
  @Op('Auth', 'setupMfa', 'Start TOTP setup (returns the secret once)')
  @ApiOkResponse({ type: MfaSetupResponseDto })
  mfaSetup(
    @CurrentUser() user: AuthUser,
    @Body() dto: PasswordConfirmDto,
  ): Promise<MfaSetupResponseDto> {
    return this.auth.mfaSetup(user, dto.password);
  }

  @Post('mfa/enable')
  @HttpCode(204)
  @AllowPendingPasswordChange()
  @Op('Auth', 'enableMfa', 'Confirm TOTP setup with a code')
  @ApiNoContentResponse()
  mfaEnable(@CurrentUser() user: AuthUser, @Body() dto: MfaEnableRequestDto): Promise<void> {
    return this.auth.mfaEnable(user, dto.code);
  }

  @Post('mfa/disable')
  @HttpCode(204)
  @Op('Auth', 'disableMfa', 'Disable TOTP (not allowed for roles that require MFA)')
  @ApiNoContentResponse()
  mfaDisable(@CurrentUser() user: AuthUser, @Body() dto: MfaDisableRequestDto): Promise<void> {
    return this.auth.mfaDisable(user, dto.password, dto.code);
  }

  @Post('signing-pin')
  @HttpCode(204)
  @Op('Auth', 'setSigningPin', 'Set or change the 6-digit signing PIN')
  @ApiNoContentResponse()
  signingPin(@CurrentUser() user: AuthUser, @Body() dto: SigningPinRequestDto): Promise<void> {
    return this.auth.setSigningPin(user, dto.password, dto.pin);
  }

  @Get('sessions')
  @Op('Auth', 'listSessions', 'Own active sessions')
  @ApiOkResponse({ type: [SessionDto] })
  sessions(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    return this.auth.listSessions(user);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @Op('Auth', 'revokeSession', 'Revoke one of own sessions')
  @ApiNoContentResponse()
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.auth.revokeSession(user, id);
  }

  // ───────────── helpers ─────────────

  private cookie(req: Request, name: string): string | undefined {
    const v = (req.cookies as Record<string, string> | undefined)?.[name];
    return typeof v === 'string' && v ? v : undefined;
  }

  private cookieBase(): CookieOptions {
    return { httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax' };
  }

  private async respondWithSession(
    s: IssuedSession,
    res: Response,
    includeUser = true,
  ): Promise<LoginResponseDto> {
    const user = includeUser ? await this.auth.me(s.userId) : undefined;
    if (s.platform !== 'WEB') {
      return {
        mfaRequired: false,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        expiresIn: this.tokens.accessTtlSec,
        user,
      };
    }
    const refreshMaxAge = s.refreshExpiresAt.getTime() - this.clock.now().getTime();
    res.cookie(COOKIE_ACCESS, s.accessToken, {
      ...this.cookieBase(),
      path: ACCESS_COOKIE_PATH,
      maxAge: this.tokens.accessTtlSec * 1000,
    });
    res.cookie(COOKIE_REFRESH, s.refreshToken, {
      ...this.cookieBase(),
      path: REFRESH_COOKIE_PATH,
      maxAge: refreshMaxAge,
    });
    res.cookie(COOKIE_CSRF, randomToken(24), {
      httpOnly: false,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshMaxAge,
    });
    return { mfaRequired: false, expiresIn: this.tokens.accessTtlSec, user };
  }

  private clearCookies(res: Response): void {
    res.clearCookie(COOKIE_ACCESS, { ...this.cookieBase(), path: ACCESS_COOKIE_PATH });
    res.clearCookie(COOKIE_REFRESH, { ...this.cookieBase(), path: REFRESH_COOKIE_PATH });
    res.clearCookie(COOKIE_CSRF, { secure: this.config.cookieSecure, sameSite: 'lax', path: '/' });
  }
}
