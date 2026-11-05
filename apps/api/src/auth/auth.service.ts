import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Prisma, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AccessPayload } from '../common/auth.guard';
import { AuthUser } from '../common/auth-user';
import { escapeHtml, MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_NAMES_SELECT } from '../roles/roles.service';
import { linkMember } from '../users/users.service';
import { parseDay } from '../common/time';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

interface RefreshPayload {
  sub: string;
  tv: number;
}

export const ACCESS_TTL_SECONDS = 15 * 60;
/**
 * Sesión "recordada": cada renovación emite un refresh nuevo, así que solo se pierde
 * tras 180 días sin abrir la app (o al cambiar la contraseña / deshabilitar la cuenta).
 */
export const REFRESH_TTL_SECONDS = 180 * 24 * 60 * 60;

/** Cuenta de Google o Apple ya verificada, lista para vincularse a un usuario. */
export interface VerifiedIdentity {
  provider: AuthProvider;
  subject: string;
  email: string;
}

const STATUS_MESSAGES: Record<UserStatus, string | null> = {
  ACTIVE: null,
  PENDING: 'Tu cuenta está pendiente de aprobación por la iglesia',
  REJECTED: 'Tu solicitud de registro fue rechazada',
  DISABLED: 'Tu cuenta está deshabilitada',
};

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.refreshSecret = `${config.getOrThrow<string>('JWT_SECRET')}:refresh`;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { church: { select: { active: true } } },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    return this.startSession(user);
  }

  /** Abre sesión para una cuenta ya autenticada (por contraseña o por Google/Apple). */
  async startSession(user: User & { church: { active: boolean } | null }) {
    const blocked = STATUS_MESSAGES[user.status];
    if (blocked) throw new ForbiddenException(blocked);
    if (user.church && !user.church.active) {
      throw new ForbiddenException('La iglesia está deshabilitada en Kahal');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user);
  }

  /** Con `identity` (registro con Google o Apple) el email es el del proveedor y no hace falta contraseña. */
  async register(dto: RegisterDto, identity?: VerifiedIdentity | null) {
    // Quien manda contraseña hace un registro común, aunque le haya quedado un intento de Google/Apple sin terminar.
    const social = dto.password ? null : identity;
    if (!dto.password && !social) throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');

    const church = await this.prisma.church.findUnique({ where: { slug: dto.churchSlug } });
    if (!church || !church.active) throw new NotFoundException('Iglesia no encontrada');

    const email = social ? social.email : dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const birthDate = parseDay(dto.birthDate.slice(0, 10));
    if (birthDate > new Date()) throw new BadRequestException('La fecha de nacimiento no puede ser futura');
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const phone = dto.phone.trim();
    // El registro es libre: la cuenta queda activa, sin roles, y vinculada al padrón con los estados por defecto.
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : null;
    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          churchId: church.id,
          email,
          passwordHash,
          firstName,
          lastName,
          phone,
          status: UserStatus.ACTIVE,
          consentAt: new Date(),
          ...(social && { identities: { create: { provider: social.provider, subject: social.subject, email: social.email } } }),
        },
      });
      await linkMember(tx, church.id, user.id, {
        firstName,
        lastName,
        email,
        phone,
        documentId: dto.documentId.trim(),
        birthDate,
        baptized: dto.baptized,
        address: dto.address.trim(),
      });
      return user;
    }).catch((err) => {
      // Doble envío del formulario, o la misma cuenta de Google/Apple registrada mientras tanto.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe una cuenta con esos datos. Intenta ingresar.');
      }
      throw err;
    });

    await this.mail.send({
      to: email,
      subject: `Bienvenido/a a ${church.name}`,
      html: mailLayout(
        church.name,
        '¡Tu cuenta está lista!',
        `Hola ${escapeHtml(firstName)}, ya puedes ingresar a Kahal para ver las novedades, conectarte a las transmisiones y agendar citas.`,
      ),
    });
    // Queda con la sesión iniciada: quien se registra desde el QR entra directo a la app.
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user);
  }

  /** Primer paso del registro: avisa antes de pedir los datos personales si el email ya está en uso. */
  async emailAvailable(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, select: { id: true } });
    return { available: !user };
  }

  async refresh(token: string | undefined) {
    if (!token) throw new UnauthorizedException();
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(token, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.tv || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }
    return this.issueTokens(user);
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isSuperAdmin: true,
        status: true,
        passwordHash: true,
        identities: { select: { provider: true, email: true }, orderBy: { provider: 'asc' } },
        ...ROLE_NAMES_SELECT,
        church: { select: { id: true, name: true, slug: true, logoKey: true, primaryColor: true, timezone: true, defaultCurrency: true } },
        member: { select: { id: true, documentId: true, birthDate: true, baptized: true, address: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash, ...rest } = user;
    return { ...rest, hasPassword: !!passwordHash, permissions: auth.permissions };
  }

  /** Nunca deja una cuenta sin ninguna forma de ingresar. */
  async unlinkIdentity(userId: string, provider: AuthProvider) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, identities: { select: { provider: true } } },
    });
    if (!user.identities.some((i) => i.provider === provider)) throw new NotFoundException('Esa cuenta no está conectada');
    if (!user.passwordHash && user.identities.length === 1) {
      throw new BadRequestException('Crea una contraseña antes de desconectar esta cuenta: es tu única forma de ingresar');
    }
    await this.prisma.userIdentity.delete({ where: { userId_provider: { userId, provider } } });
    return { ok: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.passwordHash && !(dto.currentPassword && (await bcrypt.compare(dto.currentPassword, user.passwordHash)))) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10), tokenVersion: { increment: 1 } },
    });
    return this.issueTokens(updated);
  }

  private async issueTokens(user: User) {
    const access: AccessPayload = { sub: user.id };
    const refresh: RefreshPayload = { sub: user.id, tv: user.tokenVersion };
    return {
      accessToken: await this.jwt.signAsync(access, { expiresIn: ACCESS_TTL_SECONDS }),
      refreshToken: await this.jwt.signAsync(refresh, { secret: this.refreshSecret, expiresIn: REFRESH_TTL_SECONDS }),
    };
  }
}
