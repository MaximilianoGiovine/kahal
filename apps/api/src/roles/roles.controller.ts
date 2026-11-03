import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, RequirePermissions } from '../common/decorators';
import { RoleDto } from './roles.dto';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermissions(Permission.USERS_VIEW, Permission.ROLES_MANAGE)
  @Get()
  list(@ChurchId() churchId: string) {
    return this.roles.list(churchId);
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Post()
  create(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: RoleDto) {
    return this.roles.create(churchId, user, dto);
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Patch(':id')
  update(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RoleDto) {
    return this.roles.update(churchId, user, id, dto);
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Delete(':id')
  remove(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.roles.remove(churchId, user, id);
  }
}
