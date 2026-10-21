import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { STAFF_ROLES } from '../common/auth-user';
import { ChurchId, Public, Roles } from '../common/decorators';
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

  @Roles(...STAFF_ROLES)
  @Get('church')
  get(@ChurchId() churchId: string) {
    return this.churches.get(churchId);
  }

  @Roles(Role.ADMIN)
  @Patch('church')
  update(@ChurchId() churchId: string, @Body() dto: UpdateChurchDto) {
    return this.churches.update(churchId, dto);
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('admin/churches')
  adminList() {
    return this.churches.adminList();
  }

  @Roles(Role.SUPER_ADMIN)
  @Post('admin/churches')
  adminCreate(@Body() dto: CreateChurchDto) {
    return this.churches.adminCreate(dto);
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch('admin/churches/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateChurchDto) {
    return this.churches.adminUpdate(id, dto);
  }
}
