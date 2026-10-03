import { Controller, Get, Query } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { Op } from '../../common/openapi/op.decorator';
import { MyReviewStepDto } from '../documents/dto/revisions.dto';
import {
  DocumentRevisionSyncDto,
  DocumentSyncDto,
  MasterItemSyncDto,
  ProjectMemberSyncDto,
  ProjectSyncDto,
  SyncPullDto,
  SyncPullQueryDto,
} from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiTags('Sync')
@ApiExtraModels(
  ProjectSyncDto,
  ProjectMemberSyncDto,
  DocumentSyncDto,
  DocumentRevisionSyncDto,
  MasterItemSyncDto,
  MyReviewStepDto,
)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  @Op(
    'Sync',
    'pullChanges',
    'Mobile pull sync: snapshot then change log per scope (410 SYNC_CURSOR_EXPIRED, 403 SYNC_SCOPE_FORBIDDEN)',
  )
  @ApiOkResponse({ type: SyncPullDto })
  pull(@Query() q: SyncPullQueryDto, @CurrentUser() user: AuthUser): Promise<SyncPullDto> {
    return this.sync.pull(user, q);
  }
}
