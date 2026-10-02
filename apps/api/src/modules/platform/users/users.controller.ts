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
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, RequirePermission } from '../../../common/auth/decorators';
import { ApiPaginatedResponse, type Page } from '../../../common/http/pagination';
import { Op } from '../../../common/openapi/op.decorator';
import { DepartmentsService } from './departments.service';
import {
  CreatedUserDto,
  CreateDepartmentDto,
  CreateRoleDto,
  CreateUserDto,
  DepartmentDto,
  DirectoryUserDto,
  LicenseDto,
  LicenseInputDto,
  ListUsersQueryDto,
  PermissionInfoDto,
  RoleDto,
  TemporaryPasswordDto,
  UpdateDepartmentDto,
  UpdateLicenseDto,
  UpdateOwnProfileDto,
  UpdateRoleDto,
  UpdateUserDto,
  UserDetailDto,
  UserDto,
} from './dto/users.dto';
import { RolesService } from './roles.service';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly departments: DepartmentsService,
  ) {}

  // ───────────── users ─────────────

  @Get('users/directory')
  @Op('Users', 'listDirectory', 'Minimal info about every user, for names and pickers')
  @ApiOkResponse({ type: [DirectoryUserDto] })
  directory(): Promise<DirectoryUserDto[]> {
    return this.users.directory();
  }

  @Patch('users/me')
  @Op('Users', 'updateMyProfile', 'Update own profile (name, phone, language, calendar)')
  @ApiOkResponse({ type: UserDetailDto })
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOwnProfileDto,
  ): Promise<UserDetailDto> {
    return this.users.updateOwnProfile(user, dto);
  }

  @Get('users')
  @RequirePermission('user.manage')
  @Op('Users', 'listUsers', 'List users')
  @ApiPaginatedResponse(UserDto)
  list(@Query() q: ListUsersQueryDto): Promise<Page<UserDto>> {
    return this.users.list(q);
  }

  @Post('users')
  @RequirePermission('user.manage')
  @Op('Users', 'createUser', 'Create a user with a temporary password (BR-PLT-001)')
  @ApiCreatedResponse({ type: CreatedUserDto })
  create(@Body() dto: CreateUserDto): Promise<CreatedUserDto> {
    return this.users.create(dto);
  }

  @Get('users/:id')
  @RequirePermission('user.manage')
  @Op('Users', 'getUser', 'User detail with licenses')
  @ApiOkResponse({ type: UserDetailDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDetailDto> {
    return this.users.get(id);
  }

  @Patch('users/:id')
  @RequirePermission('user.manage')
  @Op('Users', 'updateUser', 'Update a user, roles or active flag (BR-PLT-001/002)')
  @ApiOkResponse({ type: UserDetailDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDetailDto> {
    return this.users.update(id, dto, actor);
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @RequirePermission('user.manage')
  @Op('Users', 'resetUserPassword', 'Set a temporary password and sign the user out')
  @ApiOkResponse({ type: TemporaryPasswordDto })
  resetPassword(@Param('id', ParseUUIDPipe) id: string): Promise<TemporaryPasswordDto> {
    return this.users.resetPassword(id);
  }

  @Post('users/:id/unlock')
  @HttpCode(204)
  @RequirePermission('user.manage')
  @Op('Users', 'unlockUser', 'Clear a login lockout')
  @ApiNoContentResponse()
  unlock(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.users.unlock(id);
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(204)
  @RequirePermission('user.manage')
  @Op('Users', 'revokeUserSessions', 'Sign the user out everywhere')
  @ApiNoContentResponse()
  revokeSessions(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.users.revokeSessions(id);
  }

  // ───────────── licenses ─────────────

  @Get('users/:id/licenses')
  @Op('Users', 'listLicenses', 'Professional licenses of a user (self or user.manage)')
  @ApiOkResponse({ type: [LicenseDto] })
  licenses(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LicenseDto[]> {
    return this.users.listLicenses(actor, id);
  }

  @Post('users/:id/licenses')
  @Op('Users', 'addLicense', 'Add a license (self-added licenses need verification — BR-PLT-004)')
  @ApiCreatedResponse({ type: LicenseDto })
  addLicense(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LicenseInputDto,
  ): Promise<LicenseDto> {
    return this.users.addLicense(actor, id, dto);
  }

  @Patch('users/:id/licenses/:licenseId')
  @Op('Users', 'updateLicense', 'Edit a license (self edits reset verification)')
  @ApiOkResponse({ type: LicenseDto })
  updateLicense(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('licenseId', ParseUUIDPipe) licenseId: string,
    @Body() dto: UpdateLicenseDto,
  ): Promise<LicenseDto> {
    return this.users.updateLicense(actor, id, licenseId, dto);
  }

  @Post('licenses/:id/verify')
  @HttpCode(200)
  @RequirePermission('user.manage')
  @Op('Users', 'verifyLicense', 'Verify a license (BR-PLT-004)')
  @ApiOkResponse({ type: LicenseDto })
  verifyLicense(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LicenseDto> {
    return this.users.verifyLicense(actor, id);
  }

  // ───────────── departments ─────────────

  @Get('departments')
  @Op('Users', 'listDepartments', 'Departments')
  @ApiOkResponse({ type: [DepartmentDto] })
  listDepartments(): Promise<DepartmentDto[]> {
    return this.departments.list();
  }

  @Post('departments')
  @RequirePermission('user.manage')
  @Op('Users', 'createDepartment', 'Create a department')
  @ApiCreatedResponse({ type: DepartmentDto })
  createDepartment(@Body() dto: CreateDepartmentDto): Promise<DepartmentDto> {
    return this.departments.create(dto);
  }

  @Patch('departments/:id')
  @RequirePermission('user.manage')
  @Op('Users', 'updateDepartment', 'Update a department')
  @ApiOkResponse({ type: DepartmentDto })
  updateDepartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ): Promise<DepartmentDto> {
    return this.departments.update(id, dto);
  }

  // ───────────── roles ─────────────

  @Get('permissions')
  @RequirePermission('role.manage')
  @Op('Roles', 'listPermissions', 'Every permission code with its description')
  @ApiOkResponse({ type: [PermissionInfoDto] })
  permissions(): PermissionInfoDto[] {
    return this.roles.permissions();
  }

  @Get('roles')
  @RequirePermission('role.manage', 'user.manage')
  @Op('Roles', 'listRoles', 'Roles with their permissions')
  @ApiOkResponse({ type: [RoleDto] })
  listRoles(): Promise<RoleDto[]> {
    return this.roles.list();
  }

  @Post('roles')
  @RequirePermission('role.manage')
  @Op('Roles', 'createRole', 'Create a custom role')
  @ApiCreatedResponse({ type: RoleDto })
  createRole(@Body() dto: CreateRoleDto): Promise<RoleDto> {
    return this.roles.create(dto);
  }

  @Patch('roles/:id')
  @RequirePermission('role.manage')
  @Op(
    'Roles',
    'updateRole',
    'Rename a role or change its permissions (applies immediately — BR-PLT-003)',
  )
  @ApiOkResponse({ type: RoleDto })
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto): Promise<RoleDto> {
    return this.roles.update(id, dto);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermission('role.manage')
  @Op('Roles', 'deleteRole', 'Delete a custom role (system roles cannot be deleted)')
  @ApiNoContentResponse()
  deleteRole(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.roles.remove(id);
  }
}
