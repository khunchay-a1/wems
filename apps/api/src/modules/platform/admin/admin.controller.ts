import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../../common/auth/decorators';
import { Public } from '../../../common/auth/public.decorator';
import { ApiPaginatedResponse, type Page } from '../../../common/http/pagination';
import { Op } from '../../../common/openapi/op.decorator';
import { AdminService } from './admin.service';
import {
  AppConfigDto,
  AuditLogDto,
  AuditLogQueryDto,
  NumberingSchemeDto,
  PreviewNumberDto,
  PreviewNumberRequestDto,
  PutSettingDto,
  SettingDto,
  UpdateNumberingSchemeDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Public()
  @Get('app/config')
  @Op('App', 'getConfig', 'Mobile app configuration (minimum supported version) — public')
  @ApiOkResponse({ type: AppConfigDto })
  appConfig(): Promise<AppConfigDto> {
    return this.admin.appConfig();
  }

  @Get('numbering-schemes')
  @RequirePermission('settings.manage')
  @Op('Admin', 'listNumberingSchemes', 'Numbering schemes (global and per project)')
  @ApiOkResponse({ type: [NumberingSchemeDto] })
  listSchemes(): Promise<NumberingSchemeDto[]> {
    return this.admin.listSchemes();
  }

  @Put('numbering-schemes/:id')
  @RequirePermission('settings.manage')
  @Op('Admin', 'updateNumberingScheme', 'Change a numbering pattern (applies to new numbers only)')
  @ApiOkResponse({ type: NumberingSchemeDto })
  updateScheme(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNumberingSchemeDto,
  ): Promise<NumberingSchemeDto> {
    return this.admin.updateScheme(id, dto);
  }

  @Post('numbering-schemes/preview')
  @HttpCode(200)
  @Op('Admin', 'previewNumber', 'Next number without advancing the counter')
  @ApiOkResponse({ type: PreviewNumberDto })
  async preview(@Body() dto: PreviewNumberRequestDto): Promise<PreviewNumberDto> {
    return { number: await this.admin.preview(dto) };
  }

  @Get('settings')
  @RequirePermission('settings.manage')
  @Op('Admin', 'listSettings', 'All settings')
  @ApiOkResponse({ type: [SettingDto] })
  listSettings(): Promise<SettingDto[]> {
    return this.admin.listSettings();
  }

  @Get('settings/:key')
  @Op('Admin', 'getSetting', 'Read a setting (some keys need settings.manage)')
  @ApiOkResponse({ type: SettingDto })
  getSetting(@CurrentUser() user: AuthUser, @Param('key') key: string): Promise<SettingDto> {
    return this.admin.getSetting(user, key);
  }

  @Put('settings/:key')
  @RequirePermission('settings.manage')
  @Op('Admin', 'putSetting', 'Update a setting (validated per key — M01 §7)')
  @ApiOkResponse({ type: SettingDto })
  putSetting(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: PutSettingDto,
  ): Promise<SettingDto> {
    return this.admin.putSetting(user, key, dto.value);
  }

  @Get('audit-logs')
  @RequirePermission('audit.read')
  @Op('Admin', 'listAuditLogs', 'Search the audit log')
  @ApiPaginatedResponse(AuditLogDto)
  auditLogs(@Query() q: AuditLogQueryDto): Promise<Page<AuditLogDto>> {
    return this.admin.auditLogs(q);
  }

  @Get('audit-logs/export')
  @RequirePermission('audit.read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  @Op('Admin', 'exportAuditLogs', 'Export the filtered audit log as CSV')
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  auditCsv(@Query() q: AuditLogQueryDto): Promise<string> {
    return this.admin.auditCsv(q);
  }
}
