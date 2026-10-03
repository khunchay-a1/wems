import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';

/** M04 design documents (docs/modules/M04-design-documents.md). */
@Module({
  imports: [ProjectsModule],
  controllers: [MasterDataController],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class DocumentsModule {}
