import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Church, UserStatus } from '@prisma/client';
import { escapeHtml, MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBillingUpdateDto, RecordDonationDto } from './billing.dto';

const DAY_MS = 86_400_000;
/** Días antes del vencimiento en que la app recuerda preparar la donación y se envía el correo. */
export const REMINDER_DAYS = 7;
const ACCESS_CACHE_MS = 30_000;

const ACCESS_CHURCH = { billingExempt: true, billingActiveUntil: true, deletionScheduledFor: true } as const;
type AccessChurch = Pick<Church, keyof typeof ACCESS_CHURCH>;

export interface Access {
  blocked: boolean;
  /** Falso mientras la iglesia espera su primera activación. */
  activated: boolean;
  /** Hasta cuándo está activa. Sin fecha: exenta, en baja o sin activar. */
  until: Date | null;
  /** Falta poco para el vencimiento: hay que preparar la donación. */
  reminder: boolean;
}

/** Resumen para el super admin: lo que más importa decidir aparece primero. */
export type AdminBillingState = 'PENDING' | 'EXPIRED' | 'DUE' | 'ACTIVE' | 'EXEMPT' | 'CLOSING';

function stateOf(church: AccessChurch, access: Access): AdminBillingState {
  if (church.deletionScheduledFor) return 'CLOSING';
  if (church.billingExempt) return 'EXEMPT';
  if (!access.activated) return 'PENDING';
  if (access.blocked) return 'EXPIRED';
  return access.reminder ? 'DUE' : 'ACTIVE';
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  /** El guard consulta en cada request: se recuerda un momento y se olvida al cambiar la activación. */
  private readonly blockedCache = new Map<string, { blocked: boolean; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /** WhatsApp de quien administra Kahal, para coordinar las donaciones: solo dígitos, con código de país. */
  private supportWhatsapp() {
    return this.config.get<string>('SUPPORT_WHATSAPP')?.replace(/\D/g, '') || null;
  }

  private publicUrl() {
    return this.config.get<string>('PUBLIC_URL')?.replace(/\/+$/, '') || '';
  }

  private async church(churchId: string) {
    const church = await this.prisma.church.findUnique({
      where: { id: churchId },
      select: { id: true, name: true, defaultCurrency: true, billingActiveUntil: true },
    });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    return church;
  }

  async access(churchId: string): Promise<Access> {
    const church = await this.prisma.church.findUnique({ where: { id: churchId }, select: ACCESS_CHURCH });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    return this.accessOf(church);
  }

  private accessOf(church: AccessChurch): Access {
    // Con la baja pedida, la iglesia tiene que poder exportar antes del borrado.
    if (church.billingExempt || church.deletionScheduledFor) return { blocked: false, activated: true, until: null, reminder: false };
    const until = church.billingActiveUntil;
    if (!until) return { blocked: true, activated: false, until: null, reminder: false };
    const left = until.getTime() - Date.now();
    if (left <= 0) return { blocked: true, activated: true, until, reminder: false };
    return { blocked: false, activated: true, until, reminder: left <= REMINDER_DAYS * DAY_MS };
  }

  async isBlocked(churchId: string) {
    const cached = this.blockedCache.get(churchId);
    if (cached && cached.expiresAt > Date.now()) return cached.blocked;
    const { blocked } = await this.access(churchId);
    this.blockedCache.set(churchId, { blocked, expiresAt: Date.now() + ACCESS_CACHE_MS });
    return blocked;
  }

  contact() {
    return { whatsapp: this.supportWhatsapp() };
  }

  async overview(churchId: string) {
    await this.church(churchId);
    const donations = await this.prisma.churchDonation.findMany({ where: { churchId }, orderBy: { receivedAt: 'desc' }, take: 24 });
    return {
      access: await this.access(churchId),
      supportWhatsapp: this.supportWhatsapp(),
      donations: donations.map((d) => ({
        id: d.id,
        amount: d.amount === null ? null : Number(d.amount),
        currency: d.currency,
        receivedAt: d.receivedAt,
        coversUntil: d.coversUntil,
      })),
    };
  }

  // --- Super admin ---

  async adminOverview() {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [churches, lastDonations, thisMonth] = await Promise.all([
      this.prisma.church.findMany({
        select: { id: true, name: true, slug: true, city: true, active: true, createdAt: true, defaultCurrency: true, billingExemptNote: true, ...ACCESS_CHURCH },
        orderBy: { name: 'asc' },
      }),
      this.prisma.churchDonation.findMany({ where: { churchId: { not: null } }, orderBy: { receivedAt: 'desc' }, distinct: ['churchId'] }),
      this.prisma.churchDonation.groupBy({ by: ['currency'], where: { receivedAt: { gte: monthStart }, amount: { not: null } }, _sum: { amount: true } }),
    ]);
    const last = new Map(lastDonations.map((d) => [d.churchId!, d]));

    const rows = churches.map((church) => {
      const access = this.accessOf(church);
      const donation = last.get(church.id);
      return {
        id: church.id,
        name: church.name,
        slug: church.slug,
        city: church.city,
        active: church.active,
        createdAt: church.createdAt,
        defaultCurrency: church.defaultCurrency,
        billingExempt: church.billingExempt,
        billingExemptNote: church.billingExemptNote,
        billingActiveUntil: church.billingActiveUntil,
        deletionScheduledFor: church.deletionScheduledFor,
        state: stateOf(church, access),
        access,
        lastDonation: donation && {
          amount: donation.amount === null ? null : Number(donation.amount),
          currency: donation.currency,
          receivedAt: donation.receivedAt,
        },
      };
    });

    // Lo donado en el mes en curso, por moneda.
    const monthly: Record<string, number> = {};
    for (const g of thisMonth) if (g.currency && g._sum.amount) monthly[g.currency] = Number(g._sum.amount);
    return { churches: rows, monthly };
  }

  async adminHistory(churchId: string) {
    await this.church(churchId);
    const list = await this.prisma.churchDonation.findMany({ where: { churchId }, orderBy: { receivedAt: 'desc' } });
    return list.map((d) => ({
      id: d.id,
      amount: d.amount === null ? null : Number(d.amount),
      currency: d.currency,
      receivedAt: d.receivedAt,
      coversUntil: d.coversUntil,
      note: d.note,
      createdAt: d.createdAt,
    }));
  }

  async recordDonation(churchId: string, dto: RecordDonationDto, recordedById: string) {
    const church = await this.church(churchId);
    const coversUntil = new Date(dto.coversUntil);
    if (coversUntil.getTime() <= Date.now()) throw new BadRequestException('La fecha de activación tiene que ser futura');
    const firstActivation = !church.billingActiveUntil;
    await this.prisma.$transaction([
      this.prisma.churchDonation.create({
        data: {
          churchId,
          churchName: church.name,
          amount: dto.amount ?? null,
          currency: dto.amount ? (dto.currency ?? church.defaultCurrency) : null,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
          coversUntil,
          note: dto.note?.trim() || null,
          recordedById,
        },
      }),
      this.prisma.church.update({ where: { id: churchId }, data: { billingActiveUntil: coversUntil, billingNoticeAt: null } }),
    ]);
    this.blockedCache.delete(churchId);

    const day = coversUntil.toISOString().slice(0, 10);
    const name = escapeHtml(church.name);
    await this.notifyAdmins(
      churchId,
      church.name,
      firstActivation ? '¡Tu iglesia ya está activa!' : 'Recibimos tu donación',
      firstActivation
        ? `Gracias por tu donación. ${name} ya puede usar todas las funciones de Kahal hasta el ${day}. Ingresa en ${escapeHtml(this.publicUrl())}/app.`
        : `Gracias por tu donación. ${name} queda activa en Kahal hasta el ${day}.`,
    ).catch((e) => this.logger.error(`No se pudo avisar la donación de ${churchId}: ${e instanceof Error ? e.message : e}`));
    return { ok: true };
  }

  async deleteDonation(churchId: string, donationId: string) {
    const { count } = await this.prisma.churchDonation.deleteMany({ where: { id: donationId, churchId } });
    if (!count) throw new NotFoundException('Donación no encontrada');
    return { ok: true };
  }

  async adminUpdate(churchId: string, dto: AdminBillingUpdateDto) {
    const church = await this.church(churchId);
    const note = dto.billingExemptNote?.trim();
    await this.prisma.church.update({
      where: { id: church.id },
      data: {
        ...(dto.billingExempt !== undefined
          ? // Al cambiar la exención, el próximo aviso de vencimiento vuelve a enviarse si corresponde.
            { billingExempt: dto.billingExempt, billingNoticeAt: null, ...(dto.billingExempt ? {} : { billingExemptNote: null }) }
          : {}),
        ...(note !== undefined ? { billingExemptNote: note || null } : {}),
        ...(dto.billingActiveUntil !== undefined ? { billingActiveUntil: dto.billingActiveUntil ? new Date(dto.billingActiveUntil) : null, billingNoticeAt: null } : {}),
      },
    });
    this.blockedCache.delete(church.id);
    return { ok: true };
  }

  // --- Avisos por correo ---

  private async notifyAdmins(churchId: string, churchName: string, title: string, body: string) {
    const admins = await this.prisma.user.findMany({
      where: { churchId, status: UserStatus.ACTIVE, roles: { some: { role: { isAdmin: true } } } },
      select: { email: true },
    });
    await Promise.all(admins.map((a) => this.mail.send({ to: a.email, subject: `${title}: ${churchName}`, html: mailLayout(churchName, title, body) })));
  }

  /** Correos a quien administra la iglesia, además del recordatorio dentro de la app: uno antes de vencer y otro al vencer. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendNotices() {
    const churches = await this.prisma.church.findMany({
      where: { billingExempt: false, deletionScheduledFor: null, active: true, billingActiveUntil: { not: null } },
      select: { id: true, name: true, billingNoticeAt: true, ...ACCESS_CHURCH },
    });
    const whatsapp = this.supportWhatsapp();
    for (const church of churches) {
      const { blocked, reminder, until } = this.accessOf(church);
      if (!blocked && !reminder) continue;
      // Un aviso antes de vencer y otro al vencer.
      const notice = church.billingNoticeAt;
      if (notice && (!blocked || notice >= until!)) continue;
      const name = escapeHtml(church.name);
      const contact = whatsapp ? ` Coordínala por WhatsApp: <a href="https://wa.me/${whatsapp}">wa.me/${whatsapp}</a>.` : '';
      const [title, body] = blocked
        ? ['Venció la donación de tu iglesia', `El acceso de ${name} a Kahal está bloqueado temporalmente porque venció su donación mensual. Se restablece al registrar la próxima donación, y los datos se conservan.${contact}`]
        : ['Prepara la donación de tu iglesia', `La donación mensual de ${name} vence el ${until!.toISOString().slice(0, 10)}. Para que la iglesia siga activa, prepara la próxima donación.${contact}`];
      try {
        await this.notifyAdmins(church.id, church.name, title, body);
        await this.prisma.church.update({ where: { id: church.id }, data: { billingNoticeAt: new Date() } });
      } catch (e) {
        this.logger.error(`Falló el aviso de vencimiento de ${church.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
