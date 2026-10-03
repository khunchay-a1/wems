import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { Op } from '../../common/openapi/op.decorator';
import { fileResponse } from './documents-excel.controller';
import {
  DocumentStatsDto,
  MyWorkDto,
  ReportQueryDto,
  SearchQueryDto,
  SearchResultDto,
} from './dto/workspace.dto';
import { WorkspaceService } from './workspace.service';

@ApiTags('Workspace')
@Controller()
export class WorkspaceController {
  constructor(private readonly ws: WorkspaceService) {}

  @Get('my-work')
  @Op(
    'Workspace',
    'getMyWork',
    'Start page: reviews, comments to answer, returned drawings, client returns',
  )
  @ApiOkResponse({ type: MyWorkDto })
  myWork(@CurrentUser() user: AuthUser): Promise<MyWorkDto> {
    return this.ws.myWork(user);
  }

  @Get('search')
  @Op('Workspace', 'search', 'Documents, projects and clients the user can see (≤ 10 each)')
  @ApiOkResponse({ type: SearchResultDto })
  search(@Query() q: SearchQueryDto, @CurrentUser() user: AuthUser): Promise<SearchResultDto> {
    return this.ws.search(user, q.q);
  }

  @Get('projects/:projectId/documents/stats')
  @Op('Workspace', 'getDocumentStats', 'Numbers for the project dashboard (M04 §9)')
  @ApiOkResponse({ type: DocumentStatsDto })
  stats(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentStatsDto> {
    return this.ws.stats(user, projectId);
  }

  @Get('projects/:projectId/reports/mdl')
  @Op('Workspace', 'exportMdl', 'Master document list as .xlsx or PDF (report.export)')
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async mdl(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() q: ReportQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    return fileResponse(await this.ws.mdl(user, projectId, q.format ?? 'xlsx'));
  }
}
