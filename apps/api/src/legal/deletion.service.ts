import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChurchRequestStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser, coversAll, effectivePermissions } from '../common/auth-user';
import { StorageService } from '../files/storage.service';
import { escapeHtml, MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RETENTION } from './documents';
import { DeleteAccountDto, ScheduleChurchDeletionDto } from './legal.dto';

const DAY_MS = 86_400_000;
/** Lo que ya existía al publicar esto recibe el mismo plazo completo, en lugar de borrarse la primera noche. */
const UNFINISHED_PURGE_STARTS = new Date('2026-11-06T00:00:00Z').getTime() + RETENTION.unfinishedDays * DAY_MS;

@Injectable()
export class DeletionService {
  private readonly logger = new Logger(DeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  // --- Cuentas ---

  async deleteOwnAccount(actor: AuthUser, dto: DeleteAccountDto) {
    if (actor.isSuperAdmin) throw new BadRequestException('Una cuenta de super admin no se puede eliminar desde aquí');
    await this.verifyPassword(actor.id, dto.password);
    await this.assertNotLastAdmin(actor.id);
    await this.removeUser(actor.id);
  }

  async deleteChurchUser(churchId: string, actor: AuthUser, id: string) {
    if (id === actor.id) throw new BadRequestException('Para eliminar tu cuenta, usa Mi perfil');
    const target = await this.prisma.user.findFirst({
      where: { id, churchId, isSuperAdmin: false },
      include: { roles: { include: { role: true } } },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    if (!coversAll(actor, effectivePermissions(target.roles.map((r) => r.role)))) {
      throw new ForbiddenException('No puedes eliminar a un usuario con más permisos que los tuyos');
    }
    await this.assertNotLastAdmin(id);
    await this.removeUser(id);
  }

  /** Quita cuenta y ficha. Los movimientos financieros quedan, porque la base los desvincula de la persona. */
  private async removeUser(id: string, options: { keepMember?: boolean } = {}) {
    const member = await this.prisma.member.findUnique({ where: { userId: id }, select: { id: true, photoKey: true } });
    await this.prisma.$transaction(async (tx) => {
      if (member && !options.keepMember) await tx.member.delete({ where: { id: member.id } });
      await tx.user.delete({ where: { id } });
    });
    if (member?.photoKey && !options.keepMember) await this.storage.delete(member.photoKey).catch((e) => this.fileError(e));
  }

  private async verifyPassword(userId: string, password?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (user.passwordHash && !(password && (await bcrypt.compare(password, user.passwordHash)))) {
      throw new UnauthorizedException('La contraseña no es correcta');
    }
  }

  /** Una iglesia activa nunca se queda sin administración. Para cerrarla está la baja de la iglesia. */
  private async assertNotLastAdmin(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { churchId: true, roles: { select: { role: { select: { isAdmin: true } } } } },
    });
    if (!user.churchId || !user.roles.some((r) => r.role.isAdmin)) return;
    const others = await this.prisma.user.count({
      where: { churchId: user.churchId, id: { not: userId }, status: UserStatus.ACTIVE, roles: { some: { role: { isAdmin: true } } } },
    });
    if (!others) {
      throw new BadRequestException('Es la única cuenta que administra la iglesia. Asigna otra administración o pide la baja de la iglesia.');
    }
  }

  // --- Iglesias ---

  /** La baja no borra en el momento: deja un plazo para cancelarla o exportar la información. */
  async scheduleChurchDeletion(churchId: string, actor: AuthUser, dto: ScheduleChurchDeletionDto) {
    const church = await this.prisma.church.findUnique({ where: { id: churchId } });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    await this.assertCanCloseChurch(churchId, actor);
    if (dto.confirm !== church.slug) throw new BadRequestException('El identificador no coincide');
    await this.verifyPassword(actor.id, dto.password);
    if (church.deletionScheduledFor) throw new BadRequestException('La baja de esta iglesia ya está programada');
    const now = Date.now();
    const scheduledFor = new Date(now + RETENTION.churchGraceDays * DAY_MS);
    const updated = await this.prisma.church.update({
      where: { id: churchId },
      data: { deletionRequestedAt: new Date(now), deletionScheduledFor: scheduledFor },
    });
    await this.notifyAdmins(
      churchId,
      church.name,
      'Baja de la iglesia programada',
      `Se pidió la baja de ${escapeHtml(church.name)}. Sus datos y archivos se borrarán a partir del ${scheduledFor.toISOString().slice(0, 10)}. Hasta entonces, quien administre la iglesia puede cancelarla desde Configuración y exportar la información.`,
    );
    return updated;
  }

  async cancelChurchDeletion(churchId: string, actor: AuthUser) {
    const church = await this.prisma.church.findUnique({ where: { id: churchId } });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    await this.assertCanCloseChurch(churchId, actor);
    const updated = await this.prisma.church.update({ where: { id: churchId }, data: { deletionRequestedAt: null, deletionScheduledFor: null } });
    if (church.deletionScheduledFor) {
      await this.notifyAdmins(churchId, church.name, 'Baja cancelada', `Se canceló la baja de ${escapeHtml(church.name)}. La iglesia sigue funcionando con normalidad.`);
    }
    return updated;
  }

  private async assertCanCloseChurch(churchId: string, actor: AuthUser) {
    if (actor.isSuperAdmin) return;
    const isAdmin = await this.prisma.user.count({ where: { id: actor.id, churchId, roles: { some: { role: { isAdmin: true } } } } });
    if (!isAdmin) throw new ForbiddenException('Solo quien administra la iglesia puede pedir su baja');
  }

  private async notifyAdmins(churchId: string, churchName: string, title: string, body: string) {
    const admins = await this.prisma.user.findMany({
      where: { churchId, status: UserStatus.ACTIVE, roles: { some: { role: { isAdmin: true } } } },
      select: { email: true },
    });
    await Promise.all(admins.map((a) => this.mail.send({ to: a.email, subject: `${title}: ${churchName}`, html: mailLayout(churchName, title, body) })));
  }

  /** Borra la iglesia. La constancia del contrato queda, ya sin vínculo, hasta que venza su plazo. */
  private async purgeChurch(id: string, name: string, now: Date) {
    await this.notifyAdmins(id, name, 'Iglesia eliminada', `Los datos de ${escapeHtml(name)} se borraron de Kahal según la baja solicitada.`);
    const retainUntil = new Date(now);
    retainUntil.setFullYear(retainUntil.getFullYear() + RETENTION.agreementYears);
    await this.prisma.$transaction(async (tx) => {
      await tx.churchAgreement.updateMany({ where: { churchId: id }, data: { churchEndedAt: now, retainUntil } });
      await tx.churchRequest.deleteMany({ where: { churchId: id } });
      // Los movimientos bloquean el borrado de sus cuentas y categorías: van primero.
      await tx.transaction.deleteMany({ where: { churchId: id } });
      await tx.church.delete({ where: { id } });
    });
    await this.storage.deletePrefix(`${id}/`).catch((e) => this.fileError(e));
  }

  // --- Vencimientos ---

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async runScheduled() {
    await this.purgeExpired(new Date());
  }

  /** Cada paso es independiente: un fallo no deja sin correr a los demás. */
  async purgeExpired(now: Date) {
    const steps: [string, () => Promise<number>][] = [
      ['iglesias con la baja vencida', () => this.purgeScheduledChurches(now)],
      ['constancias vencidas', () => this.purgeAgreements(now)],
      ...(now.getTime() >= UNFINISHED_PURGE_STARTS
        ? ([
            ['solicitudes de iglesia', () => this.purgeRequests(now)],
            ['cuentas sin terminar', () => this.purgeUnfinishedUsers(now)],
          ] as [string, () => Promise<number>][])
        : []),
    ];
    for (const [label, run] of steps) {
      try {
        const count = await run();
        if (count) this.logger.log(`Borrado automático: ${count} ${label}`);
      } catch (e) {
        this.logger.error(`Falló el borrado automático de ${label}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  private async purgeScheduledChurches(now: Date) {
    const due = await this.prisma.church.findMany({ where: { deletionScheduledFor: { lte: now } }, select: { id: true, name: true } });
    for (const church of due) await this.purgeChurch(church.id, church.name, now);
    return due.length;
  }

  private async purgeAgreements(now: Date) {
    const { count } = await this.prisma.churchAgreement.deleteMany({ where: { retainUntil: { lte: now } } });
    return count;
  }

  private unfinishedCutoff(now: Date) {
    return new Date(now.getTime() - RETENTION.unfinishedDays * DAY_MS);
  }

  /** Una solicitud sin aprobar no llegó a ser contrato: su constancia se va con ella. */
  private async purgeRequests(now: Date) {
    const cutoff = this.unfinishedCutoff(now);
    const expired = await this.prisma.churchRequest.findMany({
      where: {
        OR: [
          { status: ChurchRequestStatus.PENDING, createdAt: { lte: cutoff } },
          { status: { not: ChurchRequestStatus.PENDING }, reviewedAt: { lte: cutoff } },
        ],
      },
      select: { id: true, status: true, name: true, adminEmail: true, adminFirstName: true },
    });
    for (const r of expired) {
      await this.prisma.$transaction(async (tx) => {
        if (r.status !== ChurchRequestStatus.APPROVED) await tx.churchAgreement.deleteMany({ where: { requestId: r.id } });
        await tx.churchRequest.delete({ where: { id: r.id } });
      });
      if (r.status === ChurchRequestStatus.PENDING) {
        await this.mail.send({
          to: r.adminEmail,
          subject: `Tu solicitud para ${r.name} venció`,
          html: mailLayout(
            r.name,
            'Tu solicitud venció',
            `Hola ${escapeHtml(r.adminFirstName)}, tu solicitud no se resolvió en ${RETENTION.unfinishedDays} días, así que borramos sus datos. Si sigues interesado, puedes enviarla de nuevo.`,
          ),
        });
      }
    }
    return expired.length;
  }

  /**
   * Cuentas sin aprobar o rechazadas, y las creadas por una iglesia que nunca se estrenaron.
   * En estas últimas la ficha queda: forma parte del registro de la iglesia, no de la cuenta.
   * Las cuentas con administración quedan fuera, porque dejarían a una iglesia sin responsable.
   */
  private async purgeUnfinishedUsers(now: Date) {
    const cutoff = this.unfinishedCutoff(now);
    const expired = await this.prisma.user.findMany({
      where: {
        isSuperAdmin: false,
        createdAt: { lte: cutoff },
        OR: [
          { status: { in: [UserStatus.PENDING, UserStatus.REJECTED] } },
          { status: UserStatus.ACTIVE, lastLoginAt: null, identities: { none: {} }, roles: { none: { role: { isAdmin: true } } } },
        ],
      },
      select: { id: true, status: true },
    });
    for (const u of expired) await this.removeUser(u.id, { keepMember: u.status === UserStatus.ACTIVE });
    return expired.length;
  }

  private fileError(e: unknown) {
    this.logger.error(`No se pudieron borrar archivos: ${e instanceof Error ? e.message : e}`);
  }
}
