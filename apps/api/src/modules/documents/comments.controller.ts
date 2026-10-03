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
  StreamableFile,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { Op } from '../../common/openapi/op.decorator';
import { CommentsService } from './comments.service';
import { fileResponse } from './documents-excel.controller';
import {
  CommentDeleteQueryDto,
  CommentDto,
  CommentStateDto,
  CreateCommentDto,
  CrsQueryDto,
  ListCommentsQueryDto,
  RespondCommentDto,
  UpdateCommentDto,
} from './dto/comments.dto';

@ApiTags('Comments')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('comments')
  @Op('Comments', 'listComments', 'Comments of an owner with replies, numbering and allowedActions')
  @ApiOkResponse({ type: [CommentDto] })
  list(@Query() q: ListCommentsQueryDto, @CurrentUser() user: AuthUser): Promise<CommentDto[]> {
    return this.comments.list(user, q.ownerType, q.ownerId);
  }

  @Post('comments')
  @Op('Comments', 'createComment', 'Comment, pin or reply (review comments BR-DOC-035)')
  @ApiCreatedResponse({ type: CommentDto, description: 'The top-level comment (with replies)' })
  create(@Body() dto: CreateCommentDto, @CurrentUser() user: AuthUser): Promise<CommentDto> {
    return this.comments.create(user, dto);
  }

  @Get('comments/:id')
  @Op('Comments', 'getComment', 'One comment thread')
  @ApiOkResponse({ type: CommentDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<CommentDto> {
    return this.comments.get(user, id);
  }

  @Patch('comments/:id')
  @Op('Comments', 'updateComment', 'Edit own comment before the step decides')
  @ApiOkResponse({ type: CommentDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CommentDto> {
    return this.comments.update(user, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @Op('Comments', 'deleteComment', 'Delete own comment before the step decides')
  @ApiNoContentResponse()
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: CommentDeleteQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.comments.remove(user, id, q.version);
  }

  @Post('comments/:id/respond')
  @HttpCode(200)
  @Op('Comments', 'respondComment', 'Preparer answers an OPEN comment → RESPONDED')
  @ApiOkResponse({ type: CommentDto })
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondCommentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CommentDto> {
    return this.comments.respond(user, id, dto);
  }

  @Post('comments/:id/close')
  @HttpCode(200)
  @Op('Comments', 'closeComment', 'Accept/withdraw → CLOSED (author or document.admin)')
  @ApiOkResponse({ type: CommentDto })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentStateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CommentDto> {
    return this.comments.close(user, id, dto);
  }

  @Post('comments/:id/reopen')
  @HttpCode(200)
  @Op('Comments', 'reopenComment', 'Answer not accepted → OPEN (author or document.admin)')
  @ApiOkResponse({ type: CommentDto })
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentStateDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CommentDto> {
    return this.comments.reopen(user, id, dto);
  }

  @Get('revisions/:id/crs')
  @Op('Comments', 'exportCrs', 'Comment resolution sheet as PDF or .xlsx (M04 §6)')
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async crs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: CrsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    return fileResponse(await this.comments.crs(user, id, q.format ?? 'pdf'));
  }
}
