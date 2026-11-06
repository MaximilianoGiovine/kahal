import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { BillingService } from '../billing/billing.service';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { buildCalendar } from './ics';

/** Eventos pasados que se mantienen en el calendario de quien se suscribe. */
const PAST_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 1000;

const newToken = () => randomBytes(32).toString('base64url');

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async subscription(user: AuthUser) {
    this.assertHasChurch(user);
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { calendarToken: true } });
    if (current.calendarToken) return { token: current.calendarToken };
    return this.rotate(user);
  }

  /** Reemplaza el enlace: el anterior deja de funcionar en cualquier calendario donde se haya usado. */
  async rotate(user: AuthUser) {
    this.assertHasChurch(user);
    const token = newToken();
    await this.prisma.user.update({ where: { id: user.id }, data: { calendarToken: token } });
    return { token };
  }

  /** Lo consultan los servidores de cada calendario, sin sesión: el token secreto identifica a la persona. */
  async feed(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { calendarToken: token },
      select: { status: true, church: { select: { id: true, name: true, timezone: true, active: true } } },
    });
    if (!user?.church?.active || user.status !== UserStatus.ACTIVE) throw new NotFoundException();
    if (await this.billing.isBlocked(user.church.id)) throw new NotFoundException();

    const events = await this.prisma.event.findMany({
      where: { churchId: user.church.id, startsAt: { gte: new Date(Date.now() - PAST_WINDOW_MS) } },
      orderBy: { startsAt: 'asc' },
      take: MAX_EVENTS,
    });
    return buildCalendar({ name: user.church.name, timezone: user.church.timezone, events });
  }

  private assertHasChurch(user: AuthUser) {
    if (!user.churchId) throw new BadRequestException('Tu cuenta no pertenece a ninguna iglesia');
  }
}
