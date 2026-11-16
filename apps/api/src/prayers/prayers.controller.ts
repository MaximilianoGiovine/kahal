import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser } from '../common/decorators';
import { PrayerFilter, PrayerRequestDto, PrayersQuery, PrayerUpdateDto } from './prayers.dto';
import { PrayersService } from './prayers.service';

@Controller('prayer-requests')
export class PrayersController {
  constructor(private readonly prayers: PrayersService) {}

  @Get()
  list(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: PrayersQuery) {
    return this.prayers.list(churchId, user, q);
  }

  @Get('text')
  text(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: PrayerFilter) {
    return this.prayers.text(churchId, user, q);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: PrayerRequestDto) {
    return this.prayers.create(churchId, user, dto);
  }

  @Patch(':id')
  update(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PrayerUpdateDto) {
    return this.prayers.update(churchId, user, id, dto);
  }

  @Delete(':id')
  remove(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prayers.remove(churchId, user, id);
  }
}
