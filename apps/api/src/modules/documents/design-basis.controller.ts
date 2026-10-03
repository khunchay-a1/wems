import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { RequireIdempotencyKey } from '../../common/http/idempotency.interceptor';
import { Op } from '../../common/openapi/op.decorator';
import { DesignBasisService } from './design-basis.service';
import {
  ApproveDesignBasisDto,
  CreateDesignBasisDto,
  DesignBasisDto,
  DesignBasisSummaryDto,
  ParameterRefDto,
  StandardRefDto,
  UpdateDesignBasisDto,
} from './dto/design-basis.dto';

@ApiTags('DesignBasis')
@Controller()
export class DesignBasisController {
  constructor(private readonly dbs: DesignBasisService) {}

  @Get('projects/:projectId/design-bases')
  @Op('DesignBasis', 'listDesignBases', 'Design basis revisions of a project')
  @ApiOkResponse({ type: [DesignBasisSummaryDto] })
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DesignBasisSummaryDto[]> {
    return this.dbs.list(user, projectId);
  }

  @Post('projects/:projectId/design-bases')
  @Op('DesignBasis', 'createDesignBasis', 'New revNo copied from the latest (BR-DOC-081)')
  @ApiCreatedResponse({ type: DesignBasisDto })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateDesignBasisDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DesignBasisDto> {
    return this.dbs.create(user, projectId, dto);
  }

  @Get('design-bases/:id')
  @Op('DesignBasis', 'getDesignBasis', 'Design basis with items and target-standard limits')
  @ApiOkResponse({ type: DesignBasisDto })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DesignBasisDto> {
    return this.dbs.get(user, id);
  }

  @Patch('design-bases/:id')
  @Op(
    'DesignBasis',
    'updateDesignBasis',
    'Edit a DRAFT; items replace the whole set (BR-DOC-081/082)',
  )
  @ApiOkResponse({ type: DesignBasisDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDesignBasisDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DesignBasisDto> {
    return this.dbs.update(user, id, dto);
  }

  @Post('design-bases/:id/approve')
  @HttpCode(200)
  @RequireIdempotencyKey()
  @Op('DesignBasis', 'approveDesignBasis', 'Approve with a signature (BR-DOC-080, 083)')
  @ApiOkResponse({ type: DesignBasisDto })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDesignBasisDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DesignBasisDto> {
    return this.dbs.approve(user, id, dto);
  }

  @Get('parameters')
  @Op('DesignBasis', 'listParameters', 'Active parameters (water quality) for pickers')
  @ApiOkResponse({ type: [ParameterRefDto] })
  parameters(): Promise<ParameterRefDto[]> {
    return this.dbs.parameters();
  }

  @Get('regulatory-standards')
  @Op('DesignBasis', 'listStandards', 'Active regulatory standards')
  @ApiOkResponse({ type: [StandardRefDto] })
  standards(): Promise<StandardRefDto[]> {
    return this.dbs.standards();
  }
}
