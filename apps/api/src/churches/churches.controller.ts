import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { ChurchId, Public, RequirePermissions, SuperAdminOnly } from '../common/decorators';
import { AdminUpdateChurchDto, CreateChurchDto, UpdateChurchDto } from './churches.dto';
import { ChurchesService } from './churches.service';
import { RegistrationsQuery, RegistrationsService } from './registrations.service';

@Controller()
export class ChurchesController {
  constructor(
    private readonly churches: ChurchesService,
    private readonly registrations: RegistrationsService,
  ) {}

  @Public()
  @Get('public/churches')
  listPublic() {
    return this.churches.listPublic();
  }

  @Public()
  @Get('public/churches/:slug')
  getPublic(@Param('slug') slug: string) {
    return this.churches.getPublic(slug);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Get('church')
  get(@ChurchId() churchId: string) {
    return this.churches.get(churchId);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Patch('church')
  update(@ChurchId() churchId: string, @Body() dto: UpdateChurchDto) {
    return this.churches.update(churchId, dto);
  }

  @SuperAdminOnly()
  @Get('admin/churches')
  adminList() {
    return this.churches.adminList();
  }

  @SuperAdminOnly()
  @Get('admin/registrations')
  adminRegistrations(@Query() q: RegistrationsQuery) {
    return this.registrations.overview(q.days, q.churchId);
  }

  @SuperAdminOnly()
  @Post('admin/churches')
  adminCreate(@Body() dto: CreateChurchDto) {
    return this.churches.adminCreate(dto);
  }

  @SuperAdminOnly()
  @Patch('admin/churches/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateChurchDto) {
    return this.churches.adminUpdate(id, dto);
  }
}
