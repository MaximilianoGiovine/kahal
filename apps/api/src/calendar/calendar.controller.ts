import { Controller, Get, Header, NotFoundException, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('subscription')
  subscription(@CurrentUser() user: AuthUser) {
    return this.calendar.subscription(user);
  }

  @Post('subscription/rotate')
  rotate(@CurrentUser() user: AuthUser) {
    return this.calendar.rotate(user);
  }

  @Public()
  // Holgado: todos los suscriptores de Google llegan desde pocas IPs. El token no se puede adivinar.
  @Throttle({ default: { limit: 1200, ttl: 60_000 } })
  @Get('feed/:file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'inline; filename="agenda.ics"')
  @Header('Cache-Control', 'private, max-age=300')
  feed(@Param('file') file: string) {
    if (!file.endsWith('.ics')) throw new NotFoundException();
    return this.calendar.feed(file.slice(0, -'.ics'.length));
  }
}
