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
  Put,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { RequireIdempotencyKey } from '../../common/http/idempotency.interceptor';
import { ApiPaginatedResponse, type Page } from '../../common/http/pagination';
import { Op } from '../../common/openapi/op.decorator';
import { DocumentsService } from './documents.service';
import {
  CreateDocumentDto,
  DocumentActionDto,
  DocumentDto,
  DocumentListItemDto,
  ListDocumentsQueryDto,
  NumberPreviewDto,
  NumberPreviewQueryDto,
  PutPlansDto,
  SaveDocumentResultDto,
  SupersedeDocumentDto,
  UpdateDocumentDto,
} from './dto/documents.dto';
import {
  AddRevisionFileDto,
  CreateRevisionDto,
  DecisionDto,
  DownloadQueryDto,
  EligibleQueryDto,
  EligibleReviewersDto,
  MyReviewStepDto,
  ReassignDto,
  ReviewCycleDto,
  ReviewStepsQueryDto,
  RevisionDto,
  SignedUrlResultDto,
  SubmitResultDto,
  SubmitRevisionDto,
  UpdateRevisionDto,
  VersionReasonBodyDto,
} from './dto/revisions.dto';
import { ReviewService } from './review.service';
import { RevisionsService } from './revisions.service';

@ApiTags('Documents')
@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly revisions: RevisionsService,
    private readonly review: ReviewService,
  ) {}

  // ───────────── register ─────────────

  @Get('projects/:projectId/documents')
  @Op('Documents', 'listDocuments', 'Document register of a project (M04 §10 filters)')
  @ApiPaginatedResponse(DocumentListItemDto)
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() q: ListDocumentsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Page<DocumentListItemDto>> {
    return this.documents.list(projectId, q, user);
  }

  @Get('projects/:projectId/documents/number-preview')
  @Op(
    'Documents',
    'previewDocumentNumber',
    'Number the next document of this discipline/type would get',
  )
  @ApiOkResponse({ type: NumberPreviewDto })
  async preview(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() q: NumberPreviewQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<NumberPreviewDto> {
    return {
      number: await this.documents.previewNumber(projectId, q.disciplineId, q.documentTypeId, user),
    };
  }

  @Post('projects/:projectId/documents')
  @Op('Documents', 'createDocument', 'Register a document (BR-DOC-010/013/014)')
  @ApiCreatedResponse({ type: SaveDocumentResultDto })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SaveDocumentResultDto> {
    return this.documents.create(projectId, dto, user);
  }

  @Get('documents/:id')
  @Op('Documents', 'getDocument', 'Document with revisions, plans and allowed actions')
  @ApiOkResponse({ type: DocumentDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<DocumentDto> {
    return this.documents.get(id, user);
  }

  @Patch('documents/:id')
  @Op('Documents', 'updateDocument', 'Edit a document (BR-DOC-011)')
  @ApiOkResponse({ type: SaveDocumentResultDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SaveDocumentResultDto> {
    return this.documents.update(id, dto, user);
  }

  @Put('documents/:id/plans')
  @Op('Documents', 'putDocumentPlans', 'Replace the delivery plan of a document')
  @ApiOkResponse({ type: DocumentDto })
  plans(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PutPlansDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentDto> {
    return this.documents.putPlans(id, dto.plans, user);
  }

  @Post('documents/:id/hold')
  @HttpCode(200)
  @Op('Documents', 'holdDocument', 'ACTIVE → ON_HOLD')
  @ApiOkResponse({ type: DocumentDto })
  hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DocumentActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.documents.act(id, 'hold', dto, u);
  }

  @Post('documents/:id/resume')
  @HttpCode(200)
  @Op('Documents', 'resumeDocument', 'ON_HOLD → ACTIVE')
  @ApiOkResponse({ type: DocumentDto })
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DocumentActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.documents.act(id, 'resume', dto, u);
  }

  @Post('documents/:id/cancel')
  @HttpCode(200)
  @Op('Documents', 'cancelDocument', 'Cancel a deliverable (reason required)')
  @ApiOkResponse({ type: DocumentDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DocumentActionDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.documents.act(id, 'cancel', dto, u);
  }

  @Post('documents/:id/supersede')
  @HttpCode(200)
  @Op('Documents', 'supersedeDocument', 'Superseded by another document of the project')
  @ApiOkResponse({ type: DocumentDto })
  supersede(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupersedeDocumentDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.documents.act(id, 'supersede', dto, u);
  }

  // ───────────── revisions ─────────────

  @Get('documents/:id/revisions')
  @Op('Documents', 'listRevisions', 'Revisions of a document (newest first)')
  @ApiOkResponse({ type: [RevisionDto] })
  revisionsOf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto[]> {
    return this.revisions.list(user, id);
  }

  @Post('documents/:id/revisions')
  @Op('Documents', 'createRevision', 'New DRAFT revision (BR-DOC-020..024, 034)')
  @ApiCreatedResponse({ type: RevisionDto })
  createRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRevisionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.revisions.create(user, id, dto);
  }

  @Get('revisions/:id')
  @Op('Documents', 'getRevision', 'Revision with files, review cycles and allowed actions')
  @ApiOkResponse({ type: RevisionDto })
  revision(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.revisions.get(user, id);
  }

  @Patch('revisions/:id')
  @Op(
    'Documents',
    'updateRevision',
    'Edit a DRAFT revision (purpose before the first submit, description)',
  )
  @ApiOkResponse({ type: RevisionDto })
  updateRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRevisionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.revisions.update(user, id, dto);
  }

  @Delete('revisions/:id')
  @HttpCode(204)
  @Op('Documents', 'discardRevision', 'Discard a never-submitted draft (BR-DOC-025)')
  @ApiNoContentResponse()
  discard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.revisions.discard(user, id);
  }

  @Post('revisions/:id/files')
  @Op('Documents', 'addRevisionFile', 'Attach an uploaded file to a DRAFT revision (BR-DOC-026)')
  @ApiCreatedResponse({ type: RevisionDto })
  addFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddRevisionFileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.revisions.addFile(user, id, dto);
  }

  @Post('revisions/:id/void')
  @HttpCode(200)
  @Op('Documents', 'voidRevision', 'Void a revision (reason required)')
  @ApiOkResponse({ type: RevisionDto })
  voidRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionReasonBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.revisions.void(user, id, dto);
  }

  @Get('revisions/:id/download')
  @Op(
    'Documents',
    'downloadRevisionFile',
    'Signed URL; PDF renditions are stamped (BR-DOC-070/071)',
  )
  @ApiOkResponse({ type: SignedUrlResultDto })
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: DownloadQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SignedUrlResultDto> {
    return this.revisions.download(user, id, q);
  }

  // ───────────── review ─────────────

  @Get('revisions/:id/eligible-reviewers')
  @Op(
    'Reviews',
    'listEligibleReviewers',
    'Assignee candidates per template step with licence status',
  )
  @ApiOkResponse({ type: EligibleReviewersDto })
  eligible(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: EligibleQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EligibleReviewersDto> {
    return this.review.eligible(user, id, q.templateId, q.templateStepId);
  }

  @Post('revisions/:id/submit')
  @HttpCode(200)
  @RequireIdempotencyKey()
  @Op('Reviews', 'submitRevision', 'Submit for review (BR-DOC-030, 040–042)')
  @ApiOkResponse({ type: SubmitResultDto })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitRevisionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SubmitResultDto> {
    return this.review.submit(user, id, dto);
  }

  @Post('revisions/:id/cancel-review')
  @HttpCode(200)
  @Op('Reviews', 'cancelReview', 'Cancel the running review cycle (reason required)')
  @ApiOkResponse({ type: RevisionDto })
  cancelReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionReasonBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.review.cancelReview(user, id, dto);
  }

  @Get('review-steps')
  @Op('Reviews', 'listReviewSteps', 'My review inbox across projects, by due date')
  @ApiOkResponse({ type: [MyReviewStepDto] })
  inbox(
    @Query() q: ReviewStepsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MyReviewStepDto[]> {
    return this.review.inbox(user, q);
  }

  @Get('review-cycles/:id')
  @Op('Reviews', 'getReviewCycle', 'Review cycle with steps')
  @ApiOkResponse({ type: ReviewCycleDto })
  cycle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ReviewCycleDto> {
    return this.review.cycle(user, id);
  }

  @Post('review-steps/:id/decision')
  @HttpCode(200)
  @RequireIdempotencyKey()
  @Op('Reviews', 'decideStep', 'Decide a review step (BR-DOC-033, 039–043)')
  @ApiOkResponse({ type: RevisionDto })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.review.decide(user, id, dto);
  }

  @Post('review-steps/:id/reassign')
  @HttpCode(200)
  @Op('Reviews', 'reassignStep', 'Hand over / reassign a review step (BR-DOC-037)')
  @ApiOkResponse({ type: RevisionDto })
  reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReassignDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.review.reassign(user, id, dto);
  }

  @Post('review-steps/:id/skip')
  @HttpCode(200)
  @Op('Reviews', 'skipStep', 'Skip an optional step (PM / document.admin)')
  @ApiOkResponse({ type: RevisionDto })
  skip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionReasonBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RevisionDto> {
    return this.review.skip(user, id, dto);
  }
}
