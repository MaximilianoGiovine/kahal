import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { ChurchId, Public, RequirePermissions, SuperAdminOnly } from '../common/decorators';
import { AdminUpdateChurchDto, CreateChurchDto, UpdateChurchDto } from './churches.dto';
import { ChurchesService } from './churches.service';

@Controller()
export class ChurchesController {
  constructor(private readonly churches: ChurchesService) {}

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
