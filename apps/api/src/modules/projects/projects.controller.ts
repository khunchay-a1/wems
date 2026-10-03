import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { RequireIdempotencyKey } from '../../common/http/idempotency.interceptor';
import { ApiPaginatedResponse, type Page } from '../../common/http/pagination';
import { Op } from '../../common/openapi/op.decorator';
import type { ProjectAction } from './domain/project-state-machine';
import {
  AddMemberDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  MemberDto,
  ProjectActionDto,
  ProjectDto,
  ProjectNumberingDto,
  ProjectOverviewDto,
  PutProjectNumberingDto,
  UpdateMemberDto,
  UpdateProjectDto,
} from './dto/projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects')
  @Op('Projects', 'listProjects', 'Projects I can see (filter q, status, type, clientId, mine)')
  @ApiPaginatedResponse(ProjectDto)
  list(@Query() q: ListProjectsQueryDto, @CurrentUser() user: AuthUser): Promise<Page<ProjectDto>> {
    return this.projects.list(q, user);
  }

  @Post('projects')
  @RequirePermission('project.create')
  @Op('Projects', 'createProject', 'Create a project (code from numbering — BR-PRJ-001/002)')
  @ApiCreatedResponse({ type: ProjectDto })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser): Promise<ProjectDto> {
    return this.projects.create(dto, user);
  }

  @Get('projects/:id')
  @Op('Projects', 'getProject', 'Project detail with allowed actions')
  @ApiOkResponse({ type: ProjectDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<ProjectDto> {
    return this.projects.get(id, user);
  }

  @Patch('projects/:id')
  @Op('Projects', 'updateProject', 'Update project fields and settings (BR-PRJ-001/004/010)')
  @ApiOkResponse({ type: ProjectDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectDto> {
    return this.projects.update(id, dto, user);
  }

  private act(id: string, action: ProjectAction, dto: ProjectActionDto, user: AuthUser) {
    return this.projects.act(id, action, dto, user);
  }

  @Post('projects/:id/start')
  @HttpCode(200)
  @Op('Projects', 'startProject', 'PLANNING → ACTIVE')
  @ApiOkResponse({ type: ProjectDto })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.act(id, 'start', dto, u);
  }

  @Post('projects/:id/hold')
  @HttpCode(200)
  @Op('Projects', 'holdProject', 'ACTIVE → ON_HOLD')
  @ApiOkResponse({ type: ProjectDto })
  hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.act(id, 'hold', dto, u);
  }

  @Post('projects/:id/resume')
  @HttpCode(200)
  @Op('Projects', 'resumeProject', 'ON_HOLD → ACTIVE')
  @ApiOkResponse({ type: ProjectDto })
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.act(id, 'resume', dto, u);
  }

  @Post('projects/:id/complete')
  @HttpCode(200)
  @Op('Projects', 'completeProject', 'ACTIVE → COMPLETED')
  @ApiOkResponse({ type: ProjectDto })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.act(id, 'complete', dto, u);
  }

  @Post('projects/:id/close')
  @HttpCode(200)
  @Op('Projects', 'closeProject', 'COMPLETED → CLOSED (BR-PRJ-021)')
  @ApiOkResponse({ type: ProjectDto })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.act(id, 'close', dto, u);
  }

  @Post('projects/:id/reopen')
  @HttpCode(200)
  @Op('Projects', 'reopenProject', 'CLOSED → ACTIVE (ADMIN, reason required)')
  @ApiOkResponse({ type: ProjectDto })
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.act(id, 'reopen', dto, u);
  }

  @Post('projects/:id/cancel')
  @HttpCode(200)
  @RequireIdempotencyKey()
  @Op('Projects', 'cancelProject', '→ CANCELLED (reason required)')
  @ApiOkResponse({ type: ProjectDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProjectActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.act(id, 'cancel', dto, u);
  }

  // ───────────── members ─────────────

  @Get('projects/:id/members')
  @Op('Projects', 'listMembers', 'Active project members')
  @ApiOkResponse({ type: [MemberDto] })
  members(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<MemberDto[]> {
    return this.projects.members(id, user);
  }

  @Post('projects/:id/members')
  @Op('Projects', 'addMember', 'Add a member (BR-PRJ-010)')
  @ApiCreatedResponse({ type: [MemberDto] })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MemberDto[]> {
    return this.projects.addMember(id, dto, user);
  }

  @Patch('projects/:id/members/:userId')
  @Op('Projects', 'updateMember', 'Change a member role (BR-PRJ-002)')
  @ApiOkResponse({ type: [MemberDto] })
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MemberDto[]> {
    return this.projects.updateMember(id, userId, dto, user);
  }

  @Delete('projects/:id/members/:userId')
  @HttpCode(204)
  @Op('Projects', 'removeMember', 'Remove a member (BR-PRJ-003)')
  @ApiNoContentResponse()
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.projects.removeMember(id, userId, user);
  }

  // ───────────── overview / numbering ─────────────

  @Get('projects/:id/overview')
  @Op('Projects', 'getProjectOverview', 'Document counts, pending reviews and recent transmittals')
  @ApiOkResponse({ type: ProjectOverviewDto })
  overview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectOverviewDto> {
    return this.projects.overview(id, user);
  }

  @Get('projects/:id/numbering-scheme')
  @Op('Projects', 'getProjectNumbering', 'DOCUMENT numbering pattern used by the project')
  @ApiOkResponse({ type: ProjectNumberingDto })
  numbering(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectNumberingDto> {
    return this.projects.getNumbering(id, user);
  }

  @Put('projects/:id/numbering-scheme')
  @Op(
    'Projects',
    'putProjectNumbering',
    'Override (or reset) the DOCUMENT pattern for this project',
  )
  @ApiOkResponse({ type: ProjectNumberingDto })
  putNumbering(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutProjectNumberingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectNumberingDto> {
    return this.projects.putNumbering(id, dto, user);
  }
}
