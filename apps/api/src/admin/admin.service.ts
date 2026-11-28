import { Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;
/** Meses que cubren los gráficos del resumen, incluido el actual. */
const MONTHS = 12;
/** Sin ingresos de nadie en este plazo, la iglesia figura como inactiva. */
const DORMANT_DAYS = 30;

const USER_BRIEF = { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, createdAt: true, lastLoginAt: true } as const;

/** "YYYY-MM" de los últimos meses, del más antiguo al actual (UTC). */
function lastMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1)).toISOString().slice(0, 7));
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /** Portada del panel: lo que hay, lo que crece y lo que pide atención. */
  async overview() {
    const months = lastMonths(MONTHS);
    const since = new Date(`${months[0]}-01T00:00:00Z`);
    const dormantBefore = new Date(Date.now() - DORMANT_DAYS * DAY_MS);

    const [billing, members, users, pendingUsers, requests, pendingRequests, userMonths, churchMonths, donationMonths, top, lastLogins, recentDonations] = await Promise.all([
      this.billing.adminOverview(),
      this.prisma.member.count(),
      this.prisma.user.count({ where: { isSuperAdmin: false, churchId: { not: null } } }),
      this.prisma.user.count({ where: { isSuperAdmin: false, churchId: { not: null }, status: UserStatus.PENDING } }),
      this.prisma.churchRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: { id: true, name: true, city: true, adminFirstName: true, adminLastName: true, createdAt: true },
      }),
      this.prisma.churchRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, count(*)::int AS count
        FROM "User" WHERE NOT "isSuperAdmin" AND "churchId" IS NOT NULL AND "createdAt" >= ${since}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, count(*)::int AS count
        FROM "Church" WHERE "createdAt" >= ${since}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; currency: string | null; count: number; total: string | null }[]>`
        SELECT to_char(date_trunc('month', "receivedAt"), 'YYYY-MM') AS month, currency::text AS currency, count(*)::int AS count, sum(amount)::text AS total
        FROM "ChurchDonation" WHERE "receivedAt" >= ${since}
        GROUP BY 1, 2`,
      this.prisma.church.findMany({
        orderBy: { members: { _count: 'desc' } },
        take: 5,
        select: { id: true, name: true, slug: true, city: true, _count: { select: { members: true, users: true } } },
      }),
      this.prisma.user.groupBy({ by: ['churchId'], where: { churchId: { not: null }, isSuperAdmin: false }, _max: { lastLoginAt: true } }),
      this.prisma.churchDonation.findMany({
        orderBy: { receivedAt: 'desc' },
        take: 5,
        select: { id: true, churchId: true, churchName: true, amount: true, currency: true, receivedAt: true, coversUntil: true },
      }),
    ]);

    const count = (rows: { month: string; count: number }[]) => {
      const by = new Map(rows.map((r) => [r.month, r.count]));
      return months.map((month) => ({ month, count: by.get(month) ?? 0 }));
    };
    const donations = months.map((month) => {
      const rows = donationMonths.filter((r) => r.month === month);
      const totals: Record<string, number> = {};
      for (const r of rows) if (r.currency && r.total !== null) totals[r.currency] = (totals[r.currency] ?? 0) + Number(r.total);
      return { month, count: rows.reduce((n, r) => n + r.count, 0), totals };
    });

    const states: Record<string, number> = { PENDING: 0, EXPIRED: 0, DUE: 0, ACTIVE: 0, EXEMPT: 0, CLOSING: 0 };
    for (const c of billing.churches) states[c.state]++;
    const urgency = { EXPIRED: 0, DUE: 1, PENDING: 2 } as Record<string, number>;
    const attention = billing.churches
      .filter((c) => c.state in urgency)
      .sort((a, b) => urgency[a.state] - urgency[b.state] || (a.access.until?.getTime() ?? 0) - (b.access.until?.getTime() ?? 0))
      .map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state, until: c.access.until, createdAt: c.createdAt }));

    // Iglesias habilitadas en las que nadie entra hace tiempo (o nunca).
    const loginOf = new Map(lastLogins.map((r) => [r.churchId!, r._max.lastLoginAt]));
    const dormant = billing.churches
      .filter((c) => c.active && c.state !== 'CLOSING' && c.createdAt < dormantBefore)
      .map((c) => ({ id: c.id, name: c.name, city: c.city, lastLoginAt: loginOf.get(c.id) ?? null }))
      .filter((c) => !c.lastLoginAt || c.lastLoginAt < dormantBefore)
      .sort((a, b) => (a.lastLoginAt?.getTime() ?? 0) - (b.lastLoginAt?.getTime() ?? 0));

    return {
      totals: {
        churches: billing.churches.length,
        enabledChurches: billing.churches.filter((c) => c.active).length,
        members,
        users,
        pendingUsers,
      },
      billing: { states, monthly: billing.monthly, attention },
      requests: { pending: pendingRequests, oldest: requests },
      growth: { users: count(userMonths), churches: count(churchMonths), donations },
      topChurches: top.map((c) => ({ id: c.id, name: c.name, slug: c.slug, city: c.city, members: c._count.members, users: c._count.users })),
      dormant: { days: DORMANT_DAYS, churches: dormant },
      recentDonations: recentDonations.map((d) => ({ ...d, amount: d.amount === null ? null : Number(d.amount) })),
    };
  }

  /** Ficha de una iglesia: datos, uso, cuentas, actividad y su activación. */
  async church(id: string) {
    const church = await this.prisma.church.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        city: true,
        address: true,
        phone: true,
        email: true,
        logoKey: true,
        timezone: true,
        defaultCurrency: true,
        active: true,
        campusesEnabled: true,
        youtubeUrl: true,
        facebookUrl: true,
        twitchUrl: true,
        deletionRequestedAt: true,
        deletionScheduledFor: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            users: true,
            campuses: true,
            ministries: true,
            families: true,
            events: true,
            announcements: true,
            articles: true,
            streams: true,
            transactions: true,
            appointments: true,
            prayerRequests: true,
          },
        },
      },
    });
    if (!church) throw new NotFoundException('Iglesia no encontrada');

    const [billing, statuses, admins, recentUsers, lastLogin, activity, agreement, request] = await Promise.all([
      this.billing.adminChurch(id),
      this.prisma.user.groupBy({ by: ['status'], where: { churchId: id, isSuperAdmin: false }, _count: true }),
      this.prisma.user.findMany({
        where: { churchId: id, isSuperAdmin: false, roles: { some: { role: { isAdmin: true } } } },
        orderBy: { createdAt: 'asc' },
        select: USER_BRIEF,
      }),
      this.prisma.user.findMany({ where: { churchId: id, isSuperAdmin: false }, orderBy: { createdAt: 'desc' }, take: 8, select: USER_BRIEF }),
      this.prisma.user.aggregate({ where: { churchId: id, isSuperAdmin: false }, _max: { lastLoginAt: true } }),
      this.prisma.activityLog.findMany({
        where: { churchId: id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, action: true, entity: true, title: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.churchAgreement.findFirst({
        where: { churchId: id },
        orderBy: { acceptedAt: 'desc' },
        select: { id: true, acceptedAt: true, signerFirstName: true, signerLastName: true, signerRole: true, contractVersion: true },
      }),
      this.prisma.churchRequest.findFirst({ where: { churchId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, message: true } }),
    ]);

    const usersByStatus: Record<string, number> = { PENDING: 0, ACTIVE: 0, REJECTED: 0, DISABLED: 0 };
    for (const s of statuses) usersByStatus[s.status] = s._count;

    const { _count, ...rest } = church;
    return {
      church: rest,
      counts: _count,
      usersByStatus,
      lastLoginAt: lastLogin._max.lastLoginAt,
      admins,
      recentUsers,
      activity,
      agreement,
      request,
      billing,
    };
  }
}
