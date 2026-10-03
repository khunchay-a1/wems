import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { Op } from '../../common/openapi/op.decorator';
import {
  CreateDisciplineDto,
  CreateDocumentTypeDto,
  CreateWorkflowTemplateDto,
  DisciplineDto,
  DocumentTypeDto,
  MasterListQueryDto,
  UpdateDisciplineDto,
  UpdateDocumentTypeDto,
  UpdateWorkflowTemplateDto,
  WorkflowTemplateDto,
} from './dto/master-data.dto';
import { MasterDataService } from './master-data.service';

@ApiTags('MasterData')
@Controller()
export class MasterDataController {
  constructor(private readonly master: MasterDataService) {}

  @Get('disciplines')
  @Op('MasterData', 'listDisciplines', 'Disciplines (active unless includeInactive)')
  @ApiOkResponse({ type: [DisciplineDto] })
  disciplines(
    @Query() q: MasterListQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DisciplineDto[]> {
    return this.master.disciplines(user, q.includeInactive);
  }

  @Post('disciplines')
  @RequirePermission('masterdata.manage')
  @Op('MasterData', 'createDiscipline', 'Create a discipline')
  @ApiCreatedResponse({ type: DisciplineDto })
  createDiscipline(@Body() dto: CreateDisciplineDto): Promise<DisciplineDto> {
    return this.master.createDiscipline(dto);
  }

  @Patch('disciplines/:id')
  @RequirePermission('masterdata.manage')
  @Op('MasterData', 'updateDiscipline', 'Update or deactivate a discipline')
  @ApiOkResponse({ type: DisciplineDto })
  updateDiscipline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDisciplineDto,
  ): Promise<DisciplineDto> {
    return this.master.updateDiscipline(id, dto);
  }

  @Get('document-types')
  @Op('MasterData', 'listDocumentTypes', 'Document types (active unless includeInactive)')
  @ApiOkResponse({ type: [DocumentTypeDto] })
  documentTypes(
    @Query() q: MasterListQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentTypeDto[]> {
    return this.master.documentTypes(user, q.includeInactive);
  }

  @Post('document-types')
  @RequirePermission('masterdata.manage')
  @Op('MasterData', 'createDocumentType', 'Create a document type')
  @ApiCreatedResponse({ type: DocumentTypeDto })
  createDocumentType(@Body() dto: CreateDocumentTypeDto): Promise<DocumentTypeDto> {
    return this.master.createDocumentType(dto);
  }

  @Patch('document-types/:id')
  @RequirePermission('masterdata.manage')
  @Op('MasterData', 'updateDocumentType', 'Update or deactivate a document type')
  @ApiOkResponse({ type: DocumentTypeDto })
  updateDocumentType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentTypeDto,
  ): Promise<DocumentTypeDto> {
    return this.master.updateDocumentType(id, dto);
  }

  @Get('workflow-templates')
  @Op('MasterData', 'listWorkflowTemplates', 'Workflow templates with steps')
  @ApiOkResponse({ type: [WorkflowTemplateDto] })
  templates(
    @Query() q: MasterListQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<WorkflowTemplateDto[]> {
    return this.master.templates(user, q.includeInactive);
  }

  @Get('workflow-templates/:id')
  @Op('MasterData', 'getWorkflowTemplate', 'Workflow template')
  @ApiOkResponse({ type: WorkflowTemplateDto })
  template(@Param('id', ParseUUIDPipe) id: string): Promise<WorkflowTemplateDto> {
    return this.master.template(id);
  }

  @Post('workflow-templates')
  @RequirePermission('masterdata.manage')
  @Op('MasterData', 'createWorkflowTemplate', 'Create a workflow template (BR-DOC-031)')
  @ApiCreatedResponse({ type: WorkflowTemplateDto })
  createTemplate(@Body() dto: CreateWorkflowTemplateDto): Promise<WorkflowTemplateDto> {
    return this.master.createTemplate(dto);
  }

  @Patch('workflow-templates/:id')
  @RequirePermission('masterdata.manage')
  @Op('MasterData', 'updateWorkflowTemplate', 'Update a template; steps are replaced as a set')
  @ApiOkResponse({ type: WorkflowTemplateDto })
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowTemplateDto,
  ): Promise<WorkflowTemplateDto> {
    return this.master.updateTemplate(id, dto);
  }
}
