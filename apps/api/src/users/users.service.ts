import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberStatus, Prisma, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { HOST_ROLES } from '../common/auth-user';
import { paginate } from '../common/pagination';
import { escapeHtml, MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateProfileDto, UpdateUserDto, UsersQuery } from './users.dto';

export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  member: { select: { id: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async list(churchId: string, query: UsersQuery) {
    const where: Prisma.UserWhereInput = {
      churchId,
      status: query.status,
      role: query.role,
      ...(query.q && {
        OR: [
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_PUBLIC_SELECT,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        ...paginate(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  pendingCount(churchId: string) {
    return this.prisma.user.count({ where: { churchId, status: UserStatus.PENDING } });
  }

  /** Pastores/líderes que reciben citas. */
  hosts(churchId: string) {
    return this.prisma.user.findMany({
      where: {
        churchId,
        status: UserStatus.ACTIVE,
        OR: [{ role: { in: HOST_ROLES } }, { availability: { some: {} } }],
      },
      select: { id: true, firstName: true, lastName: true, role: true, _count: { select: { availability: true } } },
      orderBy: { firstName: 'asc' },
    });
  }

  async create(churchId: string, dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          churchId,
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: dto.role,
          status: UserStatus.ACTIVE,
        },
        select: USER_PUBLIC_SELECT,
      });
      await this.linkMember(tx, churchId, user.id, { ...dto, email }, MemberStatus.MEMBER);
      return user;
    });
  }

  async approve(churchId: string, id: string) {
    const user = await this.find(churchId, id);
    if (user.status !== UserStatus.PENDING) throw new BadRequestException('La solicitud ya fue procesada');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { status: UserStatus.ACTIVE }, select: USER_PUBLIC_SELECT });
      await this.linkMember(tx, churchId, id, user, MemberStatus.ATTENDEE);
      return u;
    });
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId } });
    await this.mail.send({
      to: user.email,
      subject: `Bienvenido/a a ${church.name}`,
      html: mailLayout(
        church.name,
        '¡Tu cuenta fue aprobada!',
        `Hola ${escapeHtml(user.firstName)}, ya podés ingresar a Kahal para ver las novedades, conectarte a las transmisiones y agendar citas.`,
      ),
    });
    return updated;
  }

  async reject(churchId: string, id: string) {
    const user = await this.find(churchId, id);
    if (user.status !== UserStatus.PENDING) throw new BadRequestException('La solicitud ya fue procesada');
    return this.prisma.user.update({ where: { id }, data: { status: UserStatus.REJECTED }, select: USER_PUBLIC_SELECT });
  }

  async update(churchId: string, actorId: string, id: string, dto: UpdateUserDto) {
    await this.find(churchId, id);
    if (id === actorId) throw new BadRequestException('No podés modificar tu propio rol o estado');
    return this.prisma.user.update({
      where: { id },
      // Cambiar rol o estado invalida las sesiones abiertas del usuario.
      data: { ...dto, tokenVersion: { increment: 1 } },
      select: USER_PUBLIC_SELECT,
    });
  }

  updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: USER_PUBLIC_SELECT });
  }

  private async find(churchId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, churchId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Vincula la cuenta a una ficha del padrón (por email) o crea una nueva. */
  private async linkMember(
    tx: Prisma.TransactionClient,
    churchId: string,
    userId: string,
    data: { firstName: string; lastName: string; email: string; phone?: string | null },
    status: MemberStatus,
  ) {
    const existing = await tx.member.findFirst({
      where: { churchId, userId: null, email: { equals: data.email, mode: 'insensitive' } },
    });
    if (existing) {
      await tx.member.update({ where: { id: existing.id }, data: { userId } });
      return;
    }
    await tx.member.create({
      data: {
        churchId,
        userId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        status,
        joinedAt: new Date(),
      },
    });
  }
}
