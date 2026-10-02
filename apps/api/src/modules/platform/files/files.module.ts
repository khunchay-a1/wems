import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { FilesController } from './files.controller';

@Module({
  controllers: [FilesController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class FilesModule {}
