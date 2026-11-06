import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChurchRequestStatus, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { escapeHtml, MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { AgreementsService } from '../legal/agreements.service';
import { CONTRACT, PRIVACY } from '../legal/documents';
import { createChurchWithAdmin } from './church-defaults';
import { ApproveChurchRequestDto, RejectChurchRequestDto, SubmitChurchRequestDto } from './church-requests.dto';

const SLUG_TAKEN = 'Ya existe una iglesia con ese identificador';
const EMAIL_TAKEN = 'Ya existe una cuenta con ese email';
const ALREADY_REVIEWED = 'Esta solicitud ya fue revisada';

@Injectable()
export class ChurchRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly push: PushService,
    private readonly agreements: AgreementsService,
  ) {}

  async submit(dto: SubmitChurchRequestDto, origin: { ipAddress?: string; userAgent?: string }) {
    if (dto.contractVersion !== CONTRACT.version) {
      throw new ConflictException('El contrato se actualizó. Recarga la página, revísalo y vuelve a aceptarlo.');
    }
    const adminEmail = dto.email.toLowerCase().trim();
    await this.assertAvailable(dto.slug, adminEmail);
    const pending = await this.prisma.churchRequest.findFirst({
      where: { status: ChurchRequestStatus.PENDING, OR: [{ slug: dto.slug }, { adminEmail }] },
      select: { slug: true },
    });
    if (pending) {
      throw new ConflictException(
        pending.slug === dto.slug ? 'Ya hay una solicitud en revisión con ese identificador' : 'Ya hay una solicitud en revisión con ese email',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.churchRequest.create({
        data: {
        name: dto.name,
        slug: dto.slug,
        city: dto.city,
        message: dto.message,
        timezone: dto.timezone,
        defaultCurrency: dto.currency,
        adminFirstName: dto.firstName,
        adminLastName: dto.lastName,
        adminEmail,
        adminPhone: dto.phone,
        adminPasswordHash: passwordHash,
        consentAt: new Date(),
        consentVersion: PRIVACY.version,
        },
      });
      await this.agreements.create(tx, {
        requestId: request.id,
        churchName: dto.name,
        churchSlug: dto.slug,
        churchCity: dto.city,
        timezone: dto.timezone,
        currency: dto.currency,
        signerFirstName: dto.firstName,
        signerLastName: dto.lastName,
        signerEmail: adminEmail,
        signerPhone: dto.phone,
        signerDocument: dto.signerDocument,
        signerRole: dto.signerRole,
        ...origin,
      });
    });

    await this.notifySuperAdmins(dto, adminEmail);
    await this.push.sendToSuperAdmins({ title: 'Nueva solicitud de iglesia', body: dto.name, url: '/app/admin' });
    await this.mail.send({
      to: adminEmail,
      subject: `Recibimos la solicitud de ${dto.name}`,
      html: mailLayout(
        dto.name,
        'Recibimos tu solicitud',
        `Hola ${escapeHtml(dto.firstName)}, vamos a revisar los datos de tu iglesia y te avisaremos por este medio cuando esté resuelta.`,
      ),
    });
    return { ok: true };
  }

  /** Primero las pendientes. Nunca expone el hash de la contraseña. */
  list() {
    return this.prisma.churchRequest.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      omit: { adminPasswordHash: true },
    });
  }

  async approve(id: string, dto: ApproveChurchRequestDto, reviewerId: string) {
    const request = await this.getPending(id);
    const slug = dto.slug ?? request.slug;
    await this.assertAvailable(slug, request.adminEmail);

    const church = await this.prisma
      .$transaction(async (tx) => {
        // Cambiar el estado primero evita crear la iglesia dos veces si se aprueba en simultáneo.
        await this.markReviewed(tx, id, reviewerId, { status: ChurchRequestStatus.APPROVED, slug });
        const church = await createChurchWithAdmin(tx, {
          name: request.name,
          slug,
          city: request.city,
          timezone: request.timezone,
          defaultCurrency: request.defaultCurrency,
          admin: {
            firstName: request.adminFirstName,
            lastName: request.adminLastName,
            email: request.adminEmail,
            phone: request.adminPhone,
            passwordHash: request.adminPasswordHash!,
            consentAt: request.consentAt,
            consentVersion: request.consentVersion,
          },
        });
        await tx.churchRequest.update({ where: { id }, data: { churchId: church.id } });
        await tx.churchAgreement.updateMany({ where: { requestId: id }, data: { churchId: church.id } });
        return church;
      })
      .catch((err) => {
        // Alguien tomó el identificador o el email después de la verificación de arriba.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('El identificador o el email ya están en uso');
        }
        throw err;
      });

    await this.mail.send({
      to: request.adminEmail,
      subject: `${church.name} ya está en Kahal`,
      html: mailLayout(
        church.name,
        '¡Tu iglesia fue aprobada!',
        `Hola ${escapeHtml(request.adminFirstName)}, ya puedes ingresar a Kahal con este email y la contraseña que elegiste en la solicitud.`,
      ),
    });
    return church;
  }

  async reject(id: string, dto: RejectChurchRequestDto, reviewerId: string) {
    const request = await this.getPending(id);
    // Sin aprobación no hay contrato: no queda constancia que conservar.
    await this.prisma.$transaction(async (tx) => {
      await this.markReviewed(tx, id, reviewerId, { status: ChurchRequestStatus.REJECTED, rejectionReason: dto.reason });
      await tx.churchAgreement.deleteMany({ where: { requestId: id } });
    });
    await this.mail.send({
      to: request.adminEmail,
      subject: `Tu solicitud para ${request.name}`,
      html: mailLayout(
        request.name,
        'No pudimos aprobar tu solicitud',
        `Hola ${escapeHtml(request.adminFirstName)}, revisamos tu solicitud y no pudimos aprobarla.${dto.reason ? `<br><br>Motivo: ${escapeHtml(dto.reason)}` : ''}`,
      ),
    });
    return { ok: true };
  }

  private async getPending(id: string) {
    const request = await this.prisma.churchRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    if (request.status !== ChurchRequestStatus.PENDING) throw new ConflictException(ALREADY_REVIEWED);
    return request;
  }

  /** Resuelve la solicitud solo si sigue pendiente y descarta la contraseña, que ya no hace falta guardar. */
  private async markReviewed(
    tx: Prisma.TransactionClient,
    id: string,
    reviewedById: string,
    data: Pick<Prisma.ChurchRequestUncheckedUpdateManyInput, 'status' | 'slug' | 'rejectionReason'>,
  ) {
    const { count } = await tx.churchRequest.updateMany({
      where: { id, status: ChurchRequestStatus.PENDING },
      data: { ...data, reviewedById, reviewedAt: new Date(), adminPasswordHash: null },
    });
    if (!count) throw new ConflictException(ALREADY_REVIEWED);
  }

  private async assertAvailable(slug: string, email: string) {
    const [church, user] = await Promise.all([
      this.prisma.church.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (church) throw new ConflictException(SLUG_TAKEN);
    if (user) throw new ConflictException(EMAIL_TAKEN);
  }

  private async notifySuperAdmins(dto: SubmitChurchRequestDto, adminEmail: string) {
    const admins = await this.prisma.user.findMany({
      where: { isSuperAdmin: true, status: UserStatus.ACTIVE },
      select: { email: true },
    });
    const details = [
      `<b>Iglesia:</b> ${escapeHtml(dto.name)}${dto.city ? ` (${escapeHtml(dto.city)})` : ''}`,
      `<b>Identificador:</b> ${escapeHtml(dto.slug)}`,
      `<b>Responsable:</b> ${escapeHtml(`${dto.firstName} ${dto.lastName}`)}`,
      `<b>Email:</b> ${escapeHtml(adminEmail)}`,
      `<b>Teléfono:</b> ${escapeHtml(dto.phone)}`,
      ...(dto.message ? [`<b>Mensaje:</b> ${escapeHtml(dto.message)}`] : []),
    ].join('<br>');
    await Promise.all(
      admins.map((admin) =>
        this.mail.send({
          to: admin.email,
          subject: `Nueva solicitud de iglesia: ${dto.name}`,
          html: mailLayout(dto.name, 'Nueva solicitud de iglesia', `${details}<br><br>Para aprobarla o rechazarla, entra a Kahal → Plataforma → Iglesias → Solicitudes.`),
        }),
      ),
    );
  }
}
