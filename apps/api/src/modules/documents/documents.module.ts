import { Module } from '@nestjs/common';
import { AuthModule } from '../platform/auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { DesignBasisController } from './design-basis.controller';
import { DesignBasisService } from './design-basis.service';
import { DocumentAccessService } from './document-access.service';
import { DocumentsController } from './documents.controller';
import { DocumentsExcelController } from './documents-excel.controller';
import { DocumentsExcelService } from './documents-excel.service';
import { DocumentsService } from './documents.service';
import { MasterDataController } from './master-data.controller';
import { MasterDataService } from './master-data.service';
import { PublicTransmittalsService } from './public-transmittals.service';
import { ReviewService } from './review.service';
import { RevisionStampService } from './revision-stamp.service';
import { RevisionsService } from './revisions.service';
import { PublicTransmittalsController, TransmittalsController } from './transmittals.controller';
import { TransmittalsService } from './transmittals.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

/** M04 design documents (docs/modules/M04-design-documents.md). */
@Module({
  imports: [ProjectsModule, AuthModule],
  controllers: [
    MasterDataController,
    DocumentsExcelController,
    DocumentsController,
    CommentsController,
    TransmittalsController,
    PublicTransmittalsController,
    DesignBasisController,
    WorkspaceController,
  ],
  providers: [
    MasterDataService,
    DocumentAccessService,
    DocumentsService,
    RevisionsService,
    ReviewService,
    DocumentsExcelService,
    CommentsService,
    RevisionStampService,
    TransmittalsService,
    PublicTransmittalsService,
    DesignBasisService,
    WorkspaceService,
  ],
  exports: [MasterDataService, DocumentAccessService, DocumentsService, RevisionsService],
})
export class DocumentsModule {}
