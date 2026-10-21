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
import { Role, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AccessPayload } from '../common/auth.guard';
import { escapeHtml, MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

interface RefreshPayload {
  sub: string;
  tv: number;
}

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

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
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    const blocked = STATUS_MESSAGES[user.status];
    if (blocked) throw new ForbiddenException(blocked);
    if (user.church && !user.church.active) {
      throw new ForbiddenException('La iglesia está deshabilitada en Kahal');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user);
  }

  async register(dto: RegisterDto) {
    const church = await this.prisma.church.findUnique({ where: { slug: dto.churchSlug } });
    if (!church || !church.active) throw new NotFoundException('Iglesia no encontrada');

    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    await this.prisma.user.create({
      data: {
        churchId: church.id,
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        role: Role.MEMBER,
        status: UserStatus.PENDING,
        consentAt: new Date(),
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { churchId: church.id, status: UserStatus.ACTIVE, role: { in: [Role.ADMIN, Role.SECRETARY] } },
      select: { email: true },
    });
    const name = escapeHtml(`${dto.firstName} ${dto.lastName}`);
    for (const admin of admins) {
      await this.mail.send({
        to: admin.email,
        subject: 'Nueva solicitud de registro',
        html: mailLayout(church.name, 'Nueva solicitud de registro', `${name} (${escapeHtml(email)}) se registró y espera aprobación.`),
      });
    }
    return { ok: true };
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

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        church: { select: { id: true, name: true, slug: true, logoKey: true, primaryColor: true, timezone: true, defaultCurrency: true } },
        member: { select: { id: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10), tokenVersion: { increment: 1 } },
    });
    return this.issueTokens(updated);
  }

  private async issueTokens(user: User) {
    const access: AccessPayload = { sub: user.id, role: user.role, churchId: user.churchId };
    const refresh: RefreshPayload = { sub: user.id, tv: user.tokenVersion };
    return {
      accessToken: await this.jwt.signAsync(access, { expiresIn: ACCESS_TTL_SECONDS }),
      refreshToken: await this.jwt.signAsync(refresh, { secret: this.refreshSecret, expiresIn: REFRESH_TTL_SECONDS }),
    };
  }
}
