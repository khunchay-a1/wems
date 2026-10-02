import { Global, Module } from '@nestjs/common';
import { FileAccessRegistry } from './file-access.registry';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService, FileAccessRegistry, FilesService],
  exports: [StorageService, FileAccessRegistry, FilesService],
})
export class FilesCoreModule {}
