import { Controller, Get, Param } from '@nestjs/common';
import { SuperAdminOnly } from '../common/decorators';
import { AdminService } from './admin.service';

@SuperAdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('churches/:id')
  church(@Param('id') id: string) {
    return this.admin.church(id);
  }
}
