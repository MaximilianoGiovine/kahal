import { Controller, Get, Query } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { ChurchId, RequirePermissions } from '../common/decorators';
import { ActivityQuery } from './activity.dto';
import { ActivityService } from './activity.service';

/** Registro de actividad de la iglesia. */
@RequirePermissions(Permission.ACTIVITY_VIEW)
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(@ChurchId() churchId: string, @Query() q: ActivityQuery) {
    return this.activity.list(churchId, q);
  }

  @Get('authors')
  authors(@ChurchId() churchId: string) {
    return this.activity.authors(churchId);
  }
}
