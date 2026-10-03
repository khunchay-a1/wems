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
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { Public } from '../../common/auth/public.decorator';
import { RequestContext } from '../../common/http/request-context';
import { RequireIdempotencyKey } from '../../common/http/idempotency.interceptor';
import { ApiPaginatedResponse, type Page } from '../../common/http/pagination';
import { Op } from '../../common/openapi/op.decorator';
import { SignedUrlResultDto } from './dto/revisions.dto';
import {
  AcknowledgeDto,
  CancelTransmittalDto,
  ClientResponseDto,
  CreateTransmittalDto,
  ExtendLinkDto,
  ListTransmittalsQueryDto,
  PublicDownloadDto,
  PublicTransmittalDto,
  SendResultDto,
  TransmittableQueryDto,
  TransmittableRevisionDto,
  TransmittalDto,
  TransmittalItemInputDto,
  TransmittalListItemDto,
  TransmittalVersionDto,
  UpdateTransmittalDto,
  UpdateTransmittalItemDto,
} from './dto/transmittals.dto';
import { PublicTransmittalsService } from './public-transmittals.service';
import { TransmittalsService } from './transmittals.service';

@ApiTags('Transmittals')
@Controller()
export class TransmittalsController {
  constructor(private readonly transmittals: TransmittalsService) {}

  @Get('projects/:projectId/transmittals')
  @Op('Transmittals', 'listTransmittals', 'Transmittals of a project')
  @ApiPaginatedResponse(TransmittalListItemDto)
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() q: ListTransmittalsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Page<TransmittalListItemDto>> {
    return this.transmittals.list(user, projectId, q);
  }

  @Get('projects/:projectId/transmittable-revisions')
  @Op(
    'Transmittals',
    'listTransmittableRevisions',
    'Approved/issued shareable revisions (BR-DOC-060/061)',
  )
  @ApiOkResponse({ type: [TransmittableRevisionDto] })
  transmittable(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() q: TransmittableQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittableRevisionDto[]> {
    return this.transmittals.transmittable(user, projectId, q.q);
  }

  @Post('projects/:projectId/transmittals')
  @Op(
    'Transmittals',
    'createTransmittal',
    'Create a DRAFT transmittal with items (number issued now)',
  )
  @ApiCreatedResponse({ type: TransmittalDto })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTransmittalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.create(user, projectId, dto);
  }

  @Get('transmittals/:id')
  @Op('Transmittals', 'getTransmittal', 'Transmittal with items, link and downloads')
  @ApiOkResponse({ type: TransmittalDto })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.get(user, id);
  }

  @Patch('transmittals/:id')
  @Op('Transmittals', 'updateTransmittal', 'Edit a DRAFT header (BR-DOC-066)')
  @ApiOkResponse({ type: TransmittalDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransmittalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.update(user, id, dto);
  }

  @Post('transmittals/:id/items')
  @Op('Transmittals', 'addTransmittalItem', 'Add a revision (BR-DOC-060)')
  @ApiCreatedResponse({ type: TransmittalDto })
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransmittalItemInputDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.addItem(user, id, dto);
  }

  @Patch('transmittals/:id/items/:itemId')
  @Op('Transmittals', 'updateTransmittalItem', 'Copies, format or remark of a DRAFT item')
  @ApiOkResponse({ type: TransmittalDto })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateTransmittalItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.updateItem(user, id, itemId, dto);
  }

  @Delete('transmittals/:id/items/:itemId')
  @Op('Transmittals', 'removeTransmittalItem', 'Remove an item from a DRAFT')
  @ApiOkResponse({ type: TransmittalDto })
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.removeItem(user, id, itemId);
  }

  @Post('transmittals/:id/send')
  @HttpCode(200)
  @RequireIdempotencyKey()
  @Op('Transmittals', 'sendTransmittal', 'Send (BR-DOC-060..063); PDF and email by the worker')
  @ApiOkResponse({ type: SendResultDto })
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransmittalVersionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SendResultDto> {
    return this.transmittals.send(user, id, dto);
  }

  @Post('transmittals/:id/cancel')
  @HttpCode(200)
  @Op('Transmittals', 'cancelTransmittal', 'Cancel a DRAFT (BR-DOC-066)')
  @ApiOkResponse({ type: TransmittalDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTransmittalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.cancel(user, id, dto);
  }

  @Post('transmittals/:id/acknowledge')
  @HttpCode(200)
  @Op('Transmittals', 'acknowledgeTransmittal', 'Record the client receipt (date ≥ sent date)')
  @ApiOkResponse({ type: TransmittalDto })
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcknowledgeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.acknowledge(user, id, dto);
  }

  @Post('transmittals/:id/revoke-link')
  @HttpCode(200)
  @Op('Transmittals', 'revokeTransmittalLink', 'Revoke the public link (BR-DOC-065)')
  @ApiOkResponse({ type: TransmittalDto })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransmittalVersionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.revokeLink(user, id, dto);
  }

  @Post('transmittals/:id/extend-link')
  @HttpCode(200)
  @Op('Transmittals', 'extendTransmittalLink', 'Extend (and re-enable) the public link')
  @ApiOkResponse({ type: TransmittalDto })
  extend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendLinkDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.extendLink(user, id, dto);
  }

  @Post('transmittals/:id/resend-email')
  @HttpCode(200)
  @Op('Transmittals', 'resendTransmittalEmail', 'Send the email again (worker)')
  @ApiOkResponse({ type: TransmittalDto })
  resend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransmittalVersionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.resendEmail(user, id, dto);
  }

  @Get('transmittals/:id/cover-sheet')
  @Op('Transmittals', 'getTransmittalCoverSheet', 'Signed URL of the cover sheet PDF')
  @ApiOkResponse({ type: SignedUrlResultDto })
  coverSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.transmittals.coverSheet(user, id);
  }

  @Post('transmittal-items/:id/client-response')
  @HttpCode(200)
  @Op('Transmittals', 'recordClientResponse', 'Client return code per item (BR-DOC-064)')
  @ApiOkResponse({ type: TransmittalDto })
  clientResponse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClientResponseDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TransmittalDto> {
    return this.transmittals.clientResponse(user, id, dto);
  }
}

/** No login: clients open `/t/<token>` (BR-DOC-065). */
@ApiTags('Public')
@Controller('public/transmittals')
@Public()
export class PublicTransmittalsController {
  constructor(private readonly pub: PublicTransmittalsService) {}

  private client() {
    const ctx = RequestContext.get();
    return { ip: ctx.ip, userAgent: ctx.userAgent };
  }

  @Get(':token')
  @Op('Public', 'getPublicTransmittal', 'Download page data (410 when expired or revoked)')
  @ApiOkResponse({ type: PublicTransmittalDto })
  view(@Param('token') token: string): Promise<PublicTransmittalDto> {
    return this.pub.view(token);
  }

  @Get(':token/items/:itemId/download')
  @Op('Public', 'downloadPublicTransmittalItem', 'Signed URL of an item file (recorded)')
  @ApiQuery({ name: 'role', required: false, enum: ['PDF_RENDITION', 'NATIVE'] })
  @ApiOkResponse({ type: PublicDownloadDto })
  download(
    @Param('token') token: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query('role') role?: 'PDF_RENDITION' | 'NATIVE',
  ): Promise<PublicDownloadDto> {
    return this.pub.download(
      token,
      itemId,
      role === 'NATIVE' || role === 'PDF_RENDITION' ? role : undefined,
      this.client(),
    );
  }

  @Get(':token/package')
  @Op('Public', 'downloadPublicTransmittalPackage', 'Signed URL of the ZIP of all files (recorded)')
  @ApiOkResponse({ type: PublicDownloadDto })
  package(@Param('token') token: string): Promise<PublicDownloadDto> {
    return this.pub.package(token, this.client());
  }
}
