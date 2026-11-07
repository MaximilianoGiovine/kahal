import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, RequirePermissions } from '../common/decorators';
import { AppointmentsQuery, BookDto, SetAvailabilityDto, SlotsQuery, UpdateStatusDto } from './appointments.dto';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('availability/me')
  availability(@ChurchId() churchId: string, @CurrentUser() user: AuthUser) {
    return this.appointments.availability(churchId, user.id);
  }

  @RequirePermissions(Permission.APPOINTMENTS_HOST)
  @Put('availability/me')
  setAvailability(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: SetAvailabilityDto) {
    return this.appointments.setAvailability(churchId, user.id, dto);
  }

  @Get('slots')
  slots(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: SlotsQuery) {
    return this.appointments.slots(churchId, user, q);
  }

  @Get()
  list(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Query() q: AppointmentsQuery) {
    return this.appointments.list(churchId, user, q);
  }

  @Post()
  book(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: BookDto) {
    return this.appointments.book(churchId, user, dto);
  }

  @Patch(':id/status')
  updateStatus(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.appointments.updateStatus(churchId, user, id, dto);
  }
}
