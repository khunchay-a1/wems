import { Module } from '@nestjs/common';
import { AuthModule } from '../platform/auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { DocumentAccessService } from './document-access.service';
import { DocumentsController } from './documents.controller';
import { DocumentsExcelController } from './documents-excel.controller';
import { DocumentsExcelService } from './documents-excel.service';
import { DocumentsService } from './documents.service';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { ReviewService } from './review.service';
import { RevisionsService } from './revisions.service';

/** M04 design documents (docs/modules/M04-design-documents.md). */
@Module({
  imports: [ProjectsModule, AuthModule],
  controllers: [MasterDataController, DocumentsExcelController, DocumentsController],
  providers: [
    MasterDataService,
    DocumentAccessService,
    DocumentsService,
    RevisionsService,
    ReviewService,
    DocumentsExcelService,
  ],
  exports: [MasterDataService, DocumentAccessService, DocumentsService, RevisionsService],
})
export class DocumentsModule {}
