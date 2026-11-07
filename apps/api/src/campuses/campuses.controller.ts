import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, RequirePermissions } from '../common/decorators';
import { CampusDto, CampusSettingsDto } from './campuses.dto';
import { CampusesService } from './campuses.service';

@Controller('campuses')
export class CampusesController {
  constructor(private readonly campuses: CampusesService) {}

  @Get()
  list(@ChurchId() churchId: string, @CurrentUser() user: AuthUser) {
    return this.campuses.list(churchId, user);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Get('manage')
  manage(@ChurchId() churchId: string) {
    return this.campuses.manage(churchId);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Put('settings')
  settings(@ChurchId() churchId: string, @Body() dto: CampusSettingsDto) {
    return this.campuses.settings(churchId, dto);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Post()
  create(@ChurchId() churchId: string, @Body() dto: CampusDto) {
    return this.campuses.create(churchId, dto);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Patch(':id')
  update(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: CampusDto) {
    return this.campuses.update(churchId, id, dto);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Delete(':id')
  remove(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.campuses.remove(churchId, id);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Post(':id/assign-unassigned')
  assignUnassigned(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.campuses.assignUnassigned(churchId, id);
  }
}
