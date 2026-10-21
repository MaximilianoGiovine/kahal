import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberStatus, Prisma, Role } from '@prisma/client';
import { FINANCE_READ_ROLES } from '../common/auth-user';
import { paginate } from '../common/pagination';
import { parseDay } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { FamilyDto, MemberDto, MembersQuery, MinistryDto } from './members.dto';

const dateOrNull = (v?: string | null) => (v === undefined ? undefined : v === null ? null : parseDay(v.slice(0, 10)));

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  buildWhere(churchId: string, query: Partial<MembersQuery>): Prisma.MemberWhereInput {
    const terms = query.q?.trim().split(/\s+/).filter(Boolean) ?? [];
    return {
      churchId,
      status: query.status,
      familyId: query.familyId,
      ...(query.ministryId && { ministries: { some: { ministryId: query.ministryId } } }),
      AND: terms.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: 'insensitive' as const } },
          { lastName: { contains: t, mode: 'insensitive' as const } },
          { email: { contains: t, mode: 'insensitive' as const } },
          { documentId: { contains: t } },
          { phone: { contains: t } },
        ],
      })),
    };
  }

  async list(churchId: string, query: MembersQuery) {
    const where = this.buildWhere(churchId, query);
    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          family: { select: { id: true, name: true } },
          ministries: { select: { ministry: { select: { id: true, name: true } } } },
          user: { select: { id: true, role: true, status: true } },
        },
        ...paginate(query),
      }),
      this.prisma.member.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  lookup(churchId: string, q: string) {
    if (q.trim().length < 2) return [];
    return this.prisma.member.findMany({
      where: this.buildWhere(churchId, { q }),
      select: { id: true, firstName: true, lastName: true, documentId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 10,
    });
  }

  async stats(churchId: string) {
    const [byStatus, total, newThisMonth] = await Promise.all([
      this.prisma.member.groupBy({ by: ['status'], where: { churchId }, _count: true }),
      this.prisma.member.count({ where: { churchId } }),
      this.prisma.member.count({
        where: { churchId, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
    ]);
    const counts = Object.fromEntries(Object.values(MemberStatus).map((s) => [s, 0])) as Record<MemberStatus, number>;
    for (const row of byStatus) counts[row.status] = row._count;
    return { total, newThisMonth, byStatus: counts };
  }

  async get(churchId: string, id: string, role: Role) {
    const member = await this.prisma.member.findFirst({
      where: { id, churchId },
      include: {
        family: { include: { members: { select: { id: true, firstName: true, lastName: true, familyRole: true } } } },
        ministries: { include: { ministry: { select: { id: true, name: true } } } },
        user: { select: { id: true, email: true, role: true, status: true, lastLoginAt: true } },
      },
    });
    if (!member) throw new NotFoundException('Miembro no encontrado');

    let giving = null;
    if (role === Role.SUPER_ADMIN || FINANCE_READ_ROLES.includes(role)) {
      giving = await this.prisma.transaction.findMany({
        where: { churchId, memberId: id },
        orderBy: { date: 'desc' },
        take: 20,
        select: {
          id: true,
          date: true,
          amount: true,
          type: true,
          account: { select: { currency: true } },
          category: { select: { name: true } },
        },
      });
    }
    return { ...member, giving };
  }

  async create(churchId: string, dto: MemberDto) {
    await this.assertRefs(churchId, dto);
    const { ministryIds, ...data } = dto;
    return this.prisma.member.create({
      data: {
        ...this.mapDates(data),
        churchId,
        ministries: ministryIds?.length ? { create: ministryIds.map((ministryId) => ({ ministryId })) } : undefined,
      },
    });
  }

  async update(churchId: string, id: string, dto: MemberDto) {
    await this.ensure(churchId, id);
    await this.assertRefs(churchId, dto);
    const { ministryIds, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (ministryIds) {
        await tx.ministryMember.deleteMany({ where: { memberId: id, ministryId: { notIn: ministryIds } } });
        await tx.ministryMember.createMany({
          data: ministryIds.map((ministryId) => ({ ministryId, memberId: id })),
          skipDuplicates: true,
        });
      }
      return tx.member.update({ where: { id }, data: this.mapDates(data) });
    });
  }

  async remove(churchId: string, id: string) {
    const member = await this.ensure(churchId, id);
    if (member.userId) {
      throw new BadRequestException('El miembro tiene una cuenta de usuario. Deshabilitá la cuenta o marcalo como inactivo.');
    }
    await this.prisma.member.delete({ where: { id } });
    return { ok: true };
  }

  // Familias

  families(churchId: string) {
    return this.prisma.family.findMany({
      where: { churchId },
      orderBy: { name: 'asc' },
      include: { members: { select: { id: true, firstName: true, lastName: true, familyRole: true } } },
    });
  }

  createFamily(churchId: string, dto: FamilyDto) {
    return this.prisma.family.create({ data: { ...dto, churchId } });
  }

  async updateFamily(churchId: string, id: string, dto: FamilyDto) {
    await this.ensureFamily(churchId, id);
    return this.prisma.family.update({ where: { id }, data: dto });
  }

  async removeFamily(churchId: string, id: string) {
    await this.ensureFamily(churchId, id);
    await this.prisma.family.delete({ where: { id } });
    return { ok: true };
  }

  // Ministerios

  ministries(churchId: string) {
    return this.prisma.ministry.findMany({
      where: { churchId },
      orderBy: { name: 'asc' },
      include: {
        leader: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { members: true } },
      },
    });
  }

  async createMinistry(churchId: string, dto: MinistryDto) {
    if (dto.leaderId) await this.ensure(churchId, dto.leaderId);
    try {
      return await this.prisma.ministry.create({ data: { ...dto, churchId } });
    } catch (e) {
      throw this.uniqueError(e, 'Ya existe un ministerio con ese nombre');
    }
  }

  async updateMinistry(churchId: string, id: string, dto: MinistryDto) {
    await this.ensureMinistry(churchId, id);
    if (dto.leaderId) await this.ensure(churchId, dto.leaderId);
    try {
      return await this.prisma.ministry.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.uniqueError(e, 'Ya existe un ministerio con ese nombre');
    }
  }

  async removeMinistry(churchId: string, id: string) {
    await this.ensureMinistry(churchId, id);
    await this.prisma.ministry.delete({ where: { id } });
    return { ok: true };
  }

  // Helpers

  private mapDates<T extends { birthDate?: string | null; joinedAt?: string | null; baptismDate?: string | null }>(data: T) {
    return {
      ...data,
      birthDate: dateOrNull(data.birthDate),
      joinedAt: dateOrNull(data.joinedAt),
      baptismDate: dateOrNull(data.baptismDate),
    };
  }

  private async assertRefs(churchId: string, dto: MemberDto) {
    if (dto.familyId) await this.ensureFamily(churchId, dto.familyId);
    if (dto.ministryIds?.length) {
      const count = await this.prisma.ministry.count({ where: { churchId, id: { in: dto.ministryIds } } });
      if (count !== new Set(dto.ministryIds).size) throw new BadRequestException('Ministerio inválido');
    }
  }

  private async ensure(churchId: string, id: string) {
    const m = await this.prisma.member.findFirst({ where: { id, churchId } });
    if (!m) throw new NotFoundException('Miembro no encontrado');
    return m;
  }

  private async ensureFamily(churchId: string, id: string) {
    if (!(await this.prisma.family.findFirst({ where: { id, churchId } }))) throw new NotFoundException('Familia no encontrada');
  }

  private async ensureMinistry(churchId: string, id: string) {
    if (!(await this.prisma.ministry.findFirst({ where: { id, churchId } }))) throw new NotFoundException('Ministerio no encontrado');
  }

  private uniqueError(e: unknown, message: string) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException(message);
    return e;
  }
}
