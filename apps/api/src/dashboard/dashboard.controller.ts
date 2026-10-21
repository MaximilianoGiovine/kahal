import { Controller, Get } from '@nestjs/common';
import { AppointmentStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { AuthUser, FINANCE_READ_ROLES, HOST_ROLES, PEOPLE_ROLES } from '../common/auth-user';
import { ChurchId, CurrentUser } from '../common/decorators';
import { todayIn } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';

const has = (u: AuthUser, roles: Role[]) => u.role === Role.SUPER_ADMIN || roles.includes(u.role);

/** Datos agregados para la pantalla de inicio, según el rol. */
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

    if (has(user, PEOPLE_ROLES) || user.role === Role.ADMIN) {
      const [members, newMembers, pending] = await Promise.all([
        this.prisma.member.count({ where: { churchId, status: { not: 'INACTIVE' } } }),
        this.prisma.member.count({ where: { churchId, createdAt: { gte: monthStart } } }),
        this.prisma.user.count({ where: { churchId, status: UserStatus.PENDING } }),
      ]);
      result.people = { members, newMembers, pending };
    }

    if (has(user, FINANCE_READ_ROLES)) {
      const rows = await this.prisma.$queryRaw<{ currency: string; type: string; total: Prisma.Decimal }[]>`
        SELECT a."currency", t."type", SUM(t."amount") AS total
        FROM "Transaction" t JOIN "FinanceAccount" a ON a."id" = t."accountId"
        WHERE t."churchId" = ${churchId} AND t."date" >= ${monthStart}
        GROUP BY 1, 2`;
      result.finance = { month: today.slice(0, 7), rows };
    }

    if (has(user, HOST_ROLES)) {
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
