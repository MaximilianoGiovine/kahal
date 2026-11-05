import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentStatus, Permission, Prisma, UserStatus } from '@prisma/client';
import { AuthUser, can } from '../common/auth-user';
import { APPOINTMENT_STATUS_LABEL } from '../common/labels';
import { addDays, minutesToTime, timeToMinutes, todayIn, weekdayOf, zonedToUtc } from '../common/time';
import { LOCALE } from '../common/locale';
import { escapeHtml, MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { AppointmentsQuery, BookDto, SetAvailabilityDto, SlotsQuery, UpdateStatusDto } from './appointments.dto';

/** Anticipación mínima para reservar. */
const MIN_LEAD_MS = 2 * 60 * 60 * 1000;
const ACTIVE_STATUSES: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
const PERSON = { select: { id: true, firstName: true, lastName: true, email: true, phone: true } };

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly push: PushService,
  ) {}

  // Disponibilidad

  availability(churchId: string, userId: string) {
    return this.prisma.availability.findMany({
      where: { churchId, userId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  async setAvailability(churchId: string, userId: string, dto: SetAvailabilityDto) {
    for (const s of dto.slots) {
      if (timeToMinutes(s.endTime) - timeToMinutes(s.startTime) < (s.slotMinutes ?? 30)) {
        throw new BadRequestException('Cada franja debe durar al menos lo que dura una cita');
      }
    }
    const byDay = new Map<number, [number, number][]>();
    for (const s of dto.slots) {
      const ranges = byDay.get(s.weekday) ?? [];
      const r: [number, number] = [timeToMinutes(s.startTime), timeToMinutes(s.endTime)];
      if (ranges.some(([a, b]) => r[0] < b && a < r[1])) throw new BadRequestException('Hay franjas superpuestas en el mismo día');
      ranges.push(r);
      byDay.set(s.weekday, ranges);
    }
    await this.prisma.$transaction([
      this.prisma.availability.deleteMany({ where: { churchId, userId } }),
      this.prisma.availability.createMany({
        data: dto.slots.map((s) => ({ ...s, slotMinutes: s.slotMinutes ?? 30, churchId, userId })),
      }),
    ]);
    return this.availability(churchId, userId);
  }

  // Turnos libres

  async slots(churchId: string, q: SlotsQuery) {
    const [church, host] = await Promise.all([
      this.prisma.church.findUniqueOrThrow({ where: { id: churchId } }),
      this.prisma.user.findFirst({ where: { id: q.hostId, churchId, status: UserStatus.ACTIVE }, include: { availability: true } }),
    ]);
    if (!host) throw new NotFoundException('Pastor o líder no encontrado');

    const tz = church.timezone;
    const start = q.from?.slice(0, 10) ?? todayIn(tz);
    const days = q.days ?? 14;
    const rangeStart = zonedToUtc(start, '00:00', tz);
    const rangeEnd = zonedToUtc(addDays(start, days), '00:00', tz);
    const booked = await this.prisma.appointment.findMany({
      where: { hostId: host.id, status: { in: ACTIVE_STATUSES }, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      select: { startsAt: true, endsAt: true },
    });
    const minStart = Date.now() + MIN_LEAD_MS;

    const result: { day: string; slots: { startsAt: string; endsAt: string; time: string }[] }[] = [];
    for (let i = 0; i < days; i++) {
      const day = addDays(start, i);
      const wd = weekdayOf(day);
      const slots: { startsAt: string; endsAt: string; time: string }[] = [];
      for (const a of host.availability.filter((x) => x.weekday === wd).sort((x, y) => x.startTime.localeCompare(y.startTime))) {
        for (let m = timeToMinutes(a.startTime); m + a.slotMinutes <= timeToMinutes(a.endTime); m += a.slotMinutes) {
          const s = zonedToUtc(day, minutesToTime(m), tz);
          const e = new Date(s.getTime() + a.slotMinutes * 60_000);
          if (s.getTime() < minStart) continue;
          if (booked.some((b) => s < b.endsAt && b.startsAt < e)) continue;
          slots.push({ startsAt: s.toISOString(), endsAt: e.toISOString(), time: minutesToTime(m) });
        }
      }
      result.push({ day, slots });
    }
    return { timezone: tz, days: result };
  }

  // Citas

  async book(churchId: string, user: AuthUser, dto: BookDto) {
    if (dto.hostId === user.id) throw new BadRequestException('No puedes agendar una cita contigo mismo');
    const startsAt = new Date(dto.startsAt);
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: (await this.prisma.church.findUniqueOrThrow({ where: { id: churchId } })).timezone,
    }).format(startsAt);
    const { days } = await this.slots(churchId, { hostId: dto.hostId, from: day, days: 1 });
    const slot = days[0]?.slots.find((s) => s.startsAt === startsAt.toISOString());
    if (!slot) throw new ConflictException('El horario ya no está disponible');

    let appointment;
    try {
      appointment = await this.prisma.appointment.create({
        data: {
          churchId,
          hostId: dto.hostId,
          requesterId: user.id,
          startsAt,
          endsAt: new Date(slot.endsAt),
          reason: dto.reason,
        },
        include: { host: PERSON, requester: PERSON, church: { select: { name: true, timezone: true } } },
      });
    } catch (e) {
      // Índice único parcial (host, inicio) para citas activas: evita doble reserva concurrente.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('El horario ya no está disponible');
      }
      throw e;
    }

    const when = this.formatWhen(appointment.startsAt, appointment.church.timezone);
    await this.mail.send({
      to: appointment.host.email,
      subject: 'Nueva solicitud de cita',
      html: mailLayout(
        appointment.church.name,
        'Nueva solicitud de cita',
        `${escapeHtml(appointment.requester.firstName)} ${escapeHtml(appointment.requester.lastName)} solicitó una cita para el <b>${when}</b>.` +
          (dto.reason ? `<br><br>Motivo: ${escapeHtml(dto.reason)}` : '') +
          '<br><br>Ingresa a Kahal para confirmarla.',
      ),
    });
    await this.push.sendToUsers([appointment.host.id], {
      title: 'Nueva solicitud de cita',
      body: `${appointment.requester.firstName} ${appointment.requester.lastName} solicitó una cita para el ${when}`,
      url: '/app/citas',
    });
    return appointment;
  }

  list(churchId: string, user: AuthUser, q: AppointmentsQuery) {
    const scope = q.scope ?? 'mine';
    const canSeeAll = can(user, Permission.APPOINTMENTS_ALL);
    if (scope === 'all' && !canSeeAll) throw new ForbiddenException();
    const now = new Date();
    return this.prisma.appointment.findMany({
      where: {
        churchId,
        status: q.status,
        ...(scope === 'mine' && { requesterId: user.id }),
        ...(scope === 'hosting' && { hostId: user.id }),
        ...(q.when === 'upcoming' && { endsAt: { gte: now } }),
        ...(q.when === 'past' && { endsAt: { lt: now } }),
      },
      include: { host: PERSON, requester: PERSON },
      orderBy: { startsAt: q.when === 'past' ? 'desc' : 'asc' },
      take: 200,
    });
  }

  async updateStatus(churchId: string, user: AuthUser, id: string, dto: UpdateStatusDto) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, churchId },
      include: { host: PERSON, requester: PERSON, church: { select: { name: true, timezone: true } } },
    });
    if (!appt) throw new NotFoundException('Cita no encontrada');

    const isHost = appt.hostId === user.id || can(user, Permission.APPOINTMENTS_ALL);
    const isRequester = appt.requesterId === user.id;
    if (!isHost && !(isRequester && dto.status === AppointmentStatus.CANCELLED)) {
      throw new ForbiddenException('No puedes realizar esta acción sobre la cita');
    }
    if (appt.status === AppointmentStatus.CANCELLED || appt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('La cita ya está cerrada');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status, ...(isHost && dto.hostNotes !== undefined && { hostNotes: dto.hostNotes }) },
      include: { host: PERSON, requester: PERSON },
    });

    if (dto.status === AppointmentStatus.CONFIRMED || dto.status === AppointmentStatus.CANCELLED) {
      const notify = isRequester && !isHost ? appt.host : appt.requester;
      const when = this.formatWhen(appt.startsAt, appt.church.timezone);
      const label = APPOINTMENT_STATUS_LABEL[dto.status].toLowerCase();
      await this.mail.send({
        to: notify.email,
        subject: `Cita ${label}`,
        html: mailLayout(appt.church.name, `Cita ${label}`, `La cita del <b>${when}</b> fue ${label}.`),
      });
      await this.push.sendToUsers([notify.id], { title: `Cita ${label}`, body: `La cita del ${when} fue ${label}.`, url: '/app/citas' });
    }
    return updated;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendReminders() {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 3600 * 1000);
    const due = await this.prisma.appointment.findMany({
      where: { status: AppointmentStatus.CONFIRMED, reminderSentAt: null, startsAt: { gt: now, lte: soon } },
      include: { host: PERSON, requester: PERSON, church: { select: { name: true, timezone: true } } },
      take: 200,
    });
    for (const a of due) {
      // Marcar primero evita reenvíos si hay más de una réplica de la API.
      const { count } = await this.prisma.appointment.updateMany({ where: { id: a.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (!count) continue;
      const when = this.formatWhen(a.startsAt, a.church.timezone);
      for (const p of [a.requester, a.host]) {
        await this.mail.send({
          to: p.email,
          subject: 'Recordatorio de cita',
          html: mailLayout(
            a.church.name,
            'Recordatorio de cita',
            `Te recordamos la cita entre ${escapeHtml(a.requester.firstName)} y ${escapeHtml(a.host.firstName)} ${escapeHtml(a.host.lastName)} el <b>${when}</b>.`,
          ),
        });
      }
      await this.push.sendToUsers([a.requester.id, a.host.id], {
        title: 'Recordatorio de cita',
        body: `Cita entre ${a.requester.firstName} y ${a.host.firstName} ${a.host.lastName} el ${when}`,
        url: '/app/citas',
      });
    }
    if (due.length) this.logger.log(`Recordatorios enviados: ${due.length}`);
  }

  private formatWhen(date: Date, timeZone: string) {
    return new Intl.DateTimeFormat(LOCALE, { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(date);
  }
}
