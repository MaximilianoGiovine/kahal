import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser, coversAll, effectivePermissions } from '../common/auth-user';
import { paginate } from '../common/pagination';
import { parseDay } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_NAMES_SELECT } from '../roles/roles.service';
import { CreateUserDto, UpdateProfileDto, UpdateUserDto, UsersQuery } from './users.dto';

export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  member: { select: { id: true } },
  campusRestricted: true,
  campuses: { select: { campus: { select: { id: true, name: true } } } },
  ...ROLE_NAMES_SELECT,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(churchId: string, query: UsersQuery) {
    const where: Prisma.UserWhereInput = {
      churchId,
      status: query.status,
      ...(query.roleId && { roles: { some: { roleId: query.roleId } } }),
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

  /** Pastores/líderes que reciben citas. */
  hosts(churchId: string) {
    return this.prisma.user.findMany({
      where: {
        churchId,
        status: UserStatus.ACTIVE,
        OR: [
          { roles: { some: { role: { OR: [{ isAdmin: true }, { permissions: { has: Permission.APPOINTMENTS_HOST } }] } } } },
          { availability: { some: {} } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, ...ROLE_NAMES_SELECT, _count: { select: { availability: true } } },
      orderBy: { firstName: 'asc' },
    });
  }

  async create(churchId: string, actor: AuthUser, dto: CreateUserDto) {
    await this.assertAssignable(churchId, actor, dto.roleIds);
    await this.assertCampusAccess(churchId, dto.campusRestricted ?? false, dto.campusIds, dto.roleIds);
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
          status: UserStatus.ACTIVE,
          roles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
          campusRestricted: dto.campusRestricted ?? false,
          ...(dto.campusRestricted && { campuses: { create: dto.campusIds?.map((campusId) => ({ campusId })) } }),
        },
        select: USER_PUBLIC_SELECT,
      });
      await linkMember(tx, churchId, user.id, { ...dto, email });
      return user;
    });
  }

  async update(churchId: string, actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.find(churchId, id);
    if (id === actor.id) throw new BadRequestException('No puedes modificar tus propios roles o estado');
    if (!coversAll(actor, effectivePermissions(target.roles.map((r) => r.role)))) {
      throw new ForbiddenException('No puedes modificar a un usuario con más permisos que los tuyos');
    }
    if (dto.roleIds) await this.assertAssignable(churchId, actor, dto.roleIds);

    const removesAdmin =
      target.roles.some((r) => r.role.isAdmin) &&
      (dto.status === UserStatus.DISABLED || (dto.roleIds && !(await this.hasAdminRole(churchId, dto.roleIds))));
    if (removesAdmin) await this.assertAnotherAdmin(churchId, id);

    // También se revisa al cambiar solo los roles: el límite no puede convivir con el rol de administración sin avisar.
    const restricted = dto.campusRestricted ?? target.campusRestricted;
    if (dto.campusRestricted !== undefined || dto.campusIds || (dto.roleIds && restricted)) {
      const campusIds = dto.campusIds ?? (restricted ? target.campuses.map((c) => c.campusId) : undefined);
      await this.assertCampusAccess(churchId, restricted, campusIds, dto.roleIds ?? target.roles.map((r) => r.roleId));
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: dto.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      if (dto.campusIds || dto.campusRestricted === false) {
        await tx.userCampus.deleteMany({ where: { userId: id } });
        if (restricted) await tx.userCampus.createMany({ data: (dto.campusIds ?? []).map((campusId) => ({ userId: id, campusId })) });
      }
      return tx.user.update({
        where: { id },
        // Deshabilitar invalida las sesiones abiertas; los cambios de roles aplican al instante.
        data: { status: dto.status, campusRestricted: dto.campusRestricted, ...(dto.status === UserStatus.DISABLED && { tokenVersion: { increment: 1 } }) },
        select: USER_PUBLIC_SELECT,
      });
    });
  }

  /** El perfil propio actualiza la cuenta y la ficha del padrón a la vez, para que coincidan. */
  updateProfile(userId: string, dto: UpdateProfileDto) {
    const { documentId, birthDate, baptized, address, ...account } = dto;
    const empty = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: userId }, data: account, select: USER_PUBLIC_SELECT });
      await tx.member.updateMany({
        where: { userId },
        data: {
          ...account,
          phone: empty(account.phone),
          documentId: empty(documentId),
          birthDate: birthDate === undefined ? undefined : birthDate ? parseDay(birthDate.slice(0, 10)) : null,
          baptized,
          address: empty(address),
        },
      });
      return user;
    });
  }

  private async find(churchId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, churchId },
      include: { roles: { include: { role: true } }, campuses: { select: { campusId: true } } },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Los roles deben ser de la iglesia y no dar más permisos que los del actor. */
  private async assertAssignable(churchId: string, actor: AuthUser, roleIds: string[]) {
    const roles = await this.prisma.churchRole.findMany({ where: { churchId, id: { in: roleIds } } });
    if (roles.length !== roleIds.length) throw new BadRequestException('Rol inválido');
    if (!coversAll(actor, effectivePermissions(roles))) {
      throw new ForbiddenException('No puedes asignar roles con permisos que no tienes');
    }
  }

  /** Un límite debe nombrar sedes de la iglesia, y no aplica a la administración, que ve siempre toda la iglesia. */
  private async assertCampusAccess(churchId: string, restricted: boolean, campusIds: string[] | undefined, roleIds: string[]) {
    if (!restricted) {
      if (campusIds?.length) throw new BadRequestException('Las sedes solo se indican al limitar el acceso');
      return;
    }
    if (!campusIds?.length) throw new BadRequestException('Elige al menos una sede');
    const found = await this.prisma.campus.count({ where: { churchId, id: { in: campusIds }, church: { campusesEnabled: true } } });
    if (found !== campusIds.length) throw new BadRequestException('Sede inválida');
    if (await this.hasAdminRole(churchId, roleIds)) {
      throw new BadRequestException('El rol de administración ve siempre toda la iglesia: no se puede limitar a una sede');
    }
  }

  private async hasAdminRole(churchId: string, roleIds: string[]) {
    return (await this.prisma.churchRole.count({ where: { churchId, id: { in: roleIds }, isAdmin: true } })) > 0;
  }

  /** Evita que la iglesia se quede sin ningún administrador activo. */
  private async assertAnotherAdmin(churchId: string, exceptUserId: string) {
    const others = await this.prisma.user.count({
      where: { churchId, id: { not: exceptUserId }, status: UserStatus.ACTIVE, roles: { some: { role: { isAdmin: true } } } },
    });
    if (!others) throw new BadRequestException('La iglesia debe tener al menos un usuario activo con el rol de administración');
  }
}

/** Vincula la cuenta a una ficha del padrón (por email) o crea una nueva con los estados por defecto. */
export async function linkMember(
  tx: Prisma.TransactionClient,
  churchId: string,
  userId: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    documentId?: string;
    birthDate?: Date;
    baptized?: boolean;
    address?: string;
    campusId?: string | null;
  },
) {
  const existing = await tx.member.findFirst({
    where: { churchId, userId: null, email: { equals: data.email, mode: 'insensitive' } },
  });
  if (existing) {
    // La ficha cargada por la iglesia manda: solo se completan los datos que faltan.
    const missing = Object.fromEntries(
      (['phone', 'documentId', 'birthDate', 'baptized', 'address', 'campusId'] as const)
        .filter((k) => (existing[k] === null || existing[k] === '') && data[k] != null)
        .map((k) => [k, data[k]]),
    );
    const member = await tx.member.update({ where: { id: existing.id }, data: { userId, email: data.email, ...missing } });
    // La cuenta toma el nombre y teléfono de la ficha para que ambos coincidan.
    await tx.user.update({ where: { id: userId }, data: { firstName: member.firstName, lastName: member.lastName, phone: member.phone } });
    return;
  }
  // Estados por defecto, más "Bautizado" si la persona dice estarlo y la iglesia conserva ese estado.
  const defaults = await tx.memberStatus.findMany({
    where: {
      churchId,
      OR: [{ isDefault: true }, ...(data.baptized ? [{ name: { equals: 'Bautizado', mode: 'insensitive' as const } }] : [])],
    },
    select: { id: true },
  });
  await tx.member.create({
    data: {
      churchId,
      userId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      documentId: data.documentId,
      birthDate: data.birthDate,
      baptized: data.baptized,
      address: data.address,
      campusId: data.campusId,
      joinedAt: new Date(),
      statuses: { create: defaults.map((s) => ({ statusId: s.id })) },
    },
  });
}
