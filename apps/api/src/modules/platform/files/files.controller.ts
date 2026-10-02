import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/auth/decorators';
import { FilesService } from '../../../common/files/files.service';
import { Op } from '../../../common/openapi/op.decorator';
import { AttachmentsService } from './attachments.service';
import {
  AttachmentDto,
  AttachmentQueryDto,
  CreateAttachmentDto,
  CreateUploadRequestDto,
  FileDto,
  SignedUrlDto,
  UploadUrlDto,
} from './dto/files.dto';

@ApiTags('Files')
@Controller()
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly attachments: AttachmentsService,
  ) {}

  @Post('files/upload-url')
  @Op('Files', 'createUploadUrl', 'Reserve a file and get a presigned PUT URL (15 min)')
  @ApiCreatedResponse({ type: UploadUrlDto })
  createUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUploadRequestDto,
  ): Promise<UploadUrlDto> {
    return this.files.createUpload(user, dto);
  }

  @Post('files/:id/complete')
  @HttpCode(200)
  @Op(
    'Files',
    'completeUpload',
    'Confirm the upload; the worker then checks and processes the file',
  )
  @ApiOkResponse({ type: FileDto })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileDto> {
    return this.files.complete(user, id);
  }

  @Get('files/:id')
  @Op('Files', 'getFile', 'File metadata and processing status')
  @ApiOkResponse({ type: FileDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<FileDto> {
    return this.files.get(user, id);
  }

  @Get('files/:id/download-url')
  @Op('Files', 'getDownloadUrl', 'Presigned download URL (5 min)')
  @ApiOkResponse({ type: SignedUrlDto })
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SignedUrlDto> {
    return this.files.downloadUrl(user, id);
  }

  @Get('files/:id/preview-url')
  @Op('Files', 'getPreviewUrl', 'Presigned URL of the first-page PNG preview')
  @ApiOkResponse({ type: SignedUrlDto })
  preview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SignedUrlDto> {
    return this.files.previewUrl(user, id);
  }

  @Get('attachments')
  @Op('Files', 'listAttachments', 'Attachments of an owner (access follows the owner)')
  @ApiOkResponse({ type: [AttachmentDto] })
  listAttachments(
    @CurrentUser() user: AuthUser,
    @Query() q: AttachmentQueryDto,
  ): Promise<AttachmentDto[]> {
    return this.attachments.list(user, q.ownerType, q.ownerId);
  }

  @Post('attachments')
  @Op('Files', 'createAttachment', 'Attach a file to an owner (client id accepted — idempotent)')
  @ApiCreatedResponse({ type: AttachmentDto })
  @ApiOkResponse({ type: AttachmentDto, description: 'Already existed (same client id)' })
  async createAttachment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAttachmentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AttachmentDto> {
    const { created, attachment } = await this.attachments.create(user, dto);
    res.status(created ? 201 : 200);
    return attachment;
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  @Op('Files', 'deleteAttachment', 'Remove an attachment')
  @ApiNoContentResponse()
  deleteAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.attachments.remove(user, id);
  }
}
