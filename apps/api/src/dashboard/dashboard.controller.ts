import { Controller, Get } from '@nestjs/common';
import { AppointmentStatus, Permission, Prisma } from '@prisma/client';
import { AuthUser, can } from '../common/auth-user';
import { ChurchId, CurrentUser } from '../common/decorators';
import { todayIn } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';

/** Datos agregados para la pantalla de inicio, según los permisos. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@ChurchId() churchId: string, @CurrentUser() user: AuthUser) {
    const now = new Date();
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { timezone: true } });
    const today = todayIn(church.timezone);
    const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);

    const [announcements, events, live, myAppointments] = await Promise.all([
      this.prisma.announcement.findMany({
        where: { churchId, published: true, publishedAt: { lte: now } },
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        take: 3,
      }),
      this.prisma.event.findMany({ where: { churchId, startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 5 }),
      this.prisma.liveStream.findFirst({ where: { churchId, isLive: true } }),
      this.prisma.appointment.findMany({
        where: { churchId, requesterId: user.id, endsAt: { gte: now }, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] } },
        include: { host: { select: { firstName: true, lastName: true } } },
        orderBy: { startsAt: 'asc' },
        take: 3,
      }),
    ]);

    const result: Record<string, unknown> = { announcements, events, live, myAppointments };

    if (can(user, Permission.MEMBERS_VIEW)) {
      const [members, newMembers] = await Promise.all([
        this.prisma.member.count({ where: { churchId, statuses: { none: { status: { inactive: true } } } } }),
        this.prisma.member.count({ where: { churchId, createdAt: { gte: monthStart } } }),
      ]);
      result.people = { members, newMembers };
    }

    if (can(user, Permission.FINANCE_VIEW)) {
      const rows = await this.prisma.$queryRaw<{ currency: string; type: string; total: Prisma.Decimal }[]>`
        SELECT a."currency", t."type", SUM(t."amount") AS total
        FROM "Transaction" t JOIN "FinanceAccount" a ON a."id" = t."accountId"
        WHERE t."churchId" = ${churchId} AND t."date" >= ${monthStart}
        GROUP BY 1, 2`;
      result.finance = { month: today.slice(0, 7), rows };
    }

    if (can(user, Permission.APPOINTMENTS_HOST)) {
      result.hosting = await this.prisma.appointment.findMany({
        where: { churchId, hostId: user.id, endsAt: { gte: now }, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] } },
        include: { requester: { select: { firstName: true, lastName: true } } },
        orderBy: { startsAt: 'asc' },
        take: 5,
      });
    }

    return result;
  }
}
