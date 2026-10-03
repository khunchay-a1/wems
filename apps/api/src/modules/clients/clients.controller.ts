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
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { VersionQueryDto } from '../../common/http/common.dto';
import { ApiPaginatedResponse, type Page } from '../../common/http/pagination';
import { Op } from '../../common/openapi/op.decorator';
import { ClientsService } from './clients.service';
import {
  ClientCodeSuggestionDto,
  ClientCodeSuggestionQueryDto,
  ClientDto,
  ClientSummaryDto,
  ContactDto,
  CreateClientDto,
  CreateContactDto,
  CreateSiteDto,
  ListClientsQueryDto,
  ListSitesQueryDto,
  SaveClientResultDto,
  SiteDto,
  UpdateClientDto,
  UpdateContactDto,
  UpdateSiteDto,
} from './dto/clients.dto';

@ApiTags('Clients')
@Controller()
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get('clients')
  @RequirePermission('client.read')
  @Op('Clients', 'listClients', 'Clients (filter q, clientType, isActive, province)')
  @ApiPaginatedResponse(ClientDto)
  list(@Query() q: ListClientsQueryDto, @CurrentUser() user: AuthUser): Promise<Page<ClientDto>> {
    return this.clients.list(q, user);
  }

  @Get('clients/code-suggestion')
  @RequirePermission('client.manage')
  @Op('Clients', 'suggestClientCode', 'Proposed unused client code (BR-CRM-001)')
  @ApiOkResponse({ type: ClientCodeSuggestionDto })
  async suggestCode(@Query() q: ClientCodeSuggestionQueryDto): Promise<ClientCodeSuggestionDto> {
    return { code: await this.clients.suggestCode(q.nameEn) };
  }

  @Post('clients')
  @RequirePermission('client.manage')
  @Op('Clients', 'createClient', 'Create a client (BR-CRM-001/002)')
  @ApiCreatedResponse({ type: SaveClientResultDto })
  create(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SaveClientResultDto> {
    return this.clients.create(dto, user);
  }

  @Get('clients/:id')
  @RequirePermission('client.read')
  @Op('Clients', 'getClient', 'Client detail')
  @ApiOkResponse({ type: ClientDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<ClientDto> {
    return this.clients.get(id, user);
  }

  @Patch('clients/:id')
  @RequirePermission('client.manage')
  @Op('Clients', 'updateClient', 'Update or (de)activate a client (code is fixed after creation)')
  @ApiOkResponse({ type: SaveClientResultDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SaveClientResultDto> {
    return this.clients.update(id, dto, user);
  }

  @Delete('clients/:id')
  @HttpCode(204)
  @RequirePermission('client.manage')
  @Op('Clients', 'deleteClient', 'Delete an unused client (BR-CRM-003)')
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @Query() q: VersionQueryDto): Promise<void> {
    return this.clients.remove(id, q.version);
  }

  @Get('clients/:id/summary')
  @RequirePermission('client.read')
  @Op('Clients', 'getClientSummary', 'Counts of related projects, sites, contacts and jobs')
  @ApiOkResponse({ type: ClientSummaryDto })
  summary(@Param('id', ParseUUIDPipe) id: string): Promise<ClientSummaryDto> {
    return this.clients.summary(id);
  }

  // ───────────── contacts ─────────────

  @Get('clients/:id/contacts')
  @RequirePermission('client.read')
  @Op('Clients', 'listContacts', 'Contacts of a client')
  @ApiOkResponse({ type: [ContactDto] })
  contacts(@Param('id', ParseUUIDPipe) id: string): Promise<ContactDto[]> {
    return this.clients.listContacts(id);
  }

  @Post('clients/:id/contacts')
  @RequirePermission('client.manage')
  @Op('Clients', 'createContact', 'Add a contact (BR-CRM-004)')
  @ApiCreatedResponse({ type: ContactDto })
  createContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContactDto,
  ): Promise<ContactDto> {
    return this.clients.createContact(id, dto);
  }

  @Patch('clients/:id/contacts/:contactId')
  @RequirePermission('client.manage')
  @Op('Clients', 'updateContact', 'Update a contact (BR-CRM-004)')
  @ApiOkResponse({ type: ContactDto })
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateContactDto,
  ): Promise<ContactDto> {
    return this.clients.updateContact(id, contactId, dto);
  }

  @Delete('clients/:id/contacts/:contactId')
  @HttpCode(204)
  @RequirePermission('client.manage')
  @Op('Clients', 'deleteContact', 'Delete a contact')
  @ApiNoContentResponse()
  removeContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Query() q: VersionQueryDto,
  ): Promise<void> {
    return this.clients.removeContact(id, contactId, q.version);
  }

  @Post('contacts/:id/anonymize')
  @HttpCode(200)
  @RequirePermission('user.manage')
  @Op('Clients', 'anonymizeContact', 'Remove personal data of a contact (BR-CRM-007, PDPA)')
  @ApiOkResponse({ type: ContactDto })
  anonymize(@Param('id', ParseUUIDPipe) id: string): Promise<ContactDto> {
    return this.clients.anonymizeContact(id);
  }

  // ───────────── sites ─────────────

  @Get('clients/:id/sites')
  @RequirePermission('client.read')
  @Op('Clients', 'listSites', 'Sites of a client')
  @ApiOkResponse({ type: [SiteDto] })
  sites(@Param('id', ParseUUIDPipe) id: string, @Query() q: ListSitesQueryDto): Promise<SiteDto[]> {
    return this.clients.listSites(id, q.isActive);
  }

  @Get('clients/:id/sites/:siteId')
  @RequirePermission('client.read')
  @Op('Clients', 'getSite', 'Site detail')
  @ApiOkResponse({ type: SiteDto })
  site(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ): Promise<SiteDto> {
    return this.clients.getSite(id, siteId);
  }

  @Post('clients/:id/sites')
  @RequirePermission('client.manage')
  @Op('Clients', 'createSite', 'Add a site (BR-CRM-005/006)')
  @ApiCreatedResponse({ type: SiteDto })
  createSite(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSiteDto): Promise<SiteDto> {
    return this.clients.createSite(id, dto);
  }

  @Patch('clients/:id/sites/:siteId')
  @RequirePermission('client.manage')
  @Op('Clients', 'updateSite', 'Update a site (BR-CRM-005/006)')
  @ApiOkResponse({ type: SiteDto })
  updateSite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: UpdateSiteDto,
  ): Promise<SiteDto> {
    return this.clients.updateSite(id, siteId, dto);
  }

  @Delete('clients/:id/sites/:siteId')
  @HttpCode(204)
  @RequirePermission('client.manage')
  @Op('Clients', 'deleteSite', 'Delete an unused site')
  @ApiNoContentResponse()
  removeSite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() q: VersionQueryDto,
  ): Promise<void> {
    return this.clients.removeSite(id, siteId, q.version);
  }
}
