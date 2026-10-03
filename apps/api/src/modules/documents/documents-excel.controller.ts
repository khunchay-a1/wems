import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { contentDisposition } from '../../common/files/file-purposes';
import { Op } from '../../common/openapi/op.decorator';
import { DocumentsExcelService, type XlsxFile } from './documents-excel.service';
import { ListDocumentsQueryDto } from './dto/documents.dto';
import { ImportRequestDto, ImportResultDto } from './dto/excel.dto';

export function fileResponse(f: XlsxFile): StreamableFile {
  return new StreamableFile(f.body, {
    type: f.mimeType,
    disposition: contentDisposition(f.name, false),
    length: f.body.length,
  });
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Documents')
@Controller()
export class DocumentsExcelController {
  constructor(private readonly excel: DocumentsExcelService) {}

  @Get('projects/:projectId/documents/export')
  @Op('Documents', 'exportDocuments', 'Register as .xlsx with the list filters (report.export)')
  @ApiProduces(XLSX)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async export(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() q: ListDocumentsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    return fileResponse(await this.excel.export(projectId, q, user));
  }

  @Get('projects/:projectId/documents/import-template')
  @Op('Documents', 'getImportTemplate', 'Excel template for importing the register (M04 §8)')
  @ApiProduces(XLSX)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async template(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    return fileResponse(await this.excel.template(projectId, user));
  }

  @Post('projects/:projectId/documents/import')
  @HttpCode(200)
  @Op('Documents', 'importDocuments', 'Dry-run or commit an Excel import (BR-DOC-015/016)')
  @ApiOkResponse({ type: ImportResultDto })
  import(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ImportRequestDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ImportResultDto> {
    return this.excel.import(projectId, dto.fileId, dto.dryRun, user);
  }
}
