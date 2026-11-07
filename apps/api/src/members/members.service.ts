import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission, Prisma } from '@prisma/client';
import { AuthUser, can } from '../common/auth-user';
import { assertAssignableCampus, assertCampusInScope, campusFilter, campusForNew, CampusScope } from '../common/campus-scope';
import { paginate } from '../common/pagination';
import { parseDay } from '../common/time';
import { ROLE_NAMES_SELECT } from '../roles/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { FamilyDto, MemberDto, MembersQuery, MemberStatusDto, MinistryDto } from './members.dto';

/** Estados de un miembro, en el orden definido por la iglesia. */
const STATUSES_SELECT = {
  statuses: { select: { status: { select: { id: true, name: true, color: true } } }, orderBy: { status: { position: 'asc' } } },
} satisfies Prisma.MemberInclude;

const dateOrNull = (v?: string | null) => (v === undefined ? undefined : v === null ? null : parseDay(v.slice(0, 10)));

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  buildWhere(churchId: string, scope: CampusScope, query: Partial<MembersQuery>): Prisma.MemberWhereInput {
    const terms = query.q?.trim().split(/\s+/).filter(Boolean) ?? [];
    return {
      churchId,
      campusId: campusFilter(scope, query.campusId),
      familyId: query.familyId,
      ...(query.statusId && { statuses: { some: { statusId: query.statusId } } }),
      ...(query.ministryId && { ministries: { some: { ministryId: query.ministryId } } }),
      ...(query.source && { userId: query.source === 'app' ? { not: null } : null }),
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

  async list(churchId: string, scope: CampusScope, query: MembersQuery) {
    const where = this.buildWhere(churchId, scope, query);
    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          campus: { select: { id: true, name: true } },
          family: { select: { id: true, name: true } },
          ministries: { select: { ministry: { select: { id: true, name: true } } } },
          user: { select: { id: true, status: true, ...ROLE_NAMES_SELECT } },
          ...STATUSES_SELECT,
        },
        ...paginate(query),
      }),
      this.prisma.member.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  lookup(churchId: string, scope: CampusScope, q: string) {
    if (q.trim().length < 2) return [];
    return this.prisma.member.findMany({
      where: this.buildWhere(churchId, scope, { q }),
      select: { id: true, firstName: true, lastName: true, documentId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 10,
    });
  }

  async stats(churchId: string, scope: CampusScope, requested?: string) {
    const campusId = campusFilter(scope, requested);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [statuses, total, newThisMonth, fromApp, fromAppThisMonth] = await Promise.all([
      this.prisma.memberStatus.findMany({
        where: { churchId },
        orderBy: { position: 'asc' },
        select: { id: true, name: true, color: true, _count: { select: { members: { where: { member: { campusId } } } } } },
      }),
      this.prisma.member.count({ where: { churchId, campusId } }),
      this.prisma.member.count({ where: { churchId, campusId, createdAt: { gte: monthStart } } }),
      this.prisma.member.count({ where: { churchId, campusId, userId: { not: null } } }),
      this.prisma.member.count({ where: { churchId, campusId, userId: { not: null }, createdAt: { gte: monthStart } } }),
    ]);
    const byStatus = statuses.map(({ _count, ...s }) => ({ ...s, count: _count.members }));
    return { total, newThisMonth, fromApp, fromAppThisMonth, byStatus };
  }

  async get(churchId: string, id: string, viewer: AuthUser) {
    const scope = viewer.campusScopes.MEMBERS;
    const campusId = campusFilter(scope);
    const member = await this.prisma.member.findFirst({
      where: { id, churchId, campusId },
      include: {
        campus: { select: { id: true, name: true } },
        family: { include: { members: { where: { campusId }, select: { id: true, firstName: true, lastName: true, familyRole: true } } } },
        ministries: { include: { ministry: { select: { id: true, name: true } } } },
        user: { select: { id: true, email: true, status: true, lastLoginAt: true, ...ROLE_NAMES_SELECT } },
        ...STATUSES_SELECT,
      },
    });
    if (!member) throw new NotFoundException('Miembro no encontrado');

    let giving = null;
    if (can(viewer, Permission.FINANCE_VIEW)) {
      giving = await this.prisma.transaction.findMany({
        where: { churchId, memberId: id, account: { campusId: campusFilter(viewer.campusScopes.FINANCE) } },
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

  async create(churchId: string, scope: CampusScope, dto: MemberDto) {
    await this.assertRefs(churchId, dto);
    const campusId = campusForNew(scope, dto.campusId);
    await assertAssignableCampus(this.prisma, churchId, campusId);
    const { ministryIds, statusIds, ...data } = dto;
    return this.prisma.member.create({
      data: {
        ...this.mapDates(data),
        churchId,
        campusId,
        ministries: ministryIds?.length ? { create: ministryIds.map((ministryId) => ({ ministryId })) } : undefined,
        statuses: statusIds?.length ? { create: statusIds.map((statusId) => ({ statusId })) } : undefined,
      },
    });
  }

  async update(churchId: string, scope: CampusScope, id: string, dto: MemberDto) {
    const member = await this.ensure(churchId, scope, id);
    await this.assertRefs(churchId, dto);
    if (dto.campusId !== undefined && dto.campusId !== member.campusId) {
      assertCampusInScope(scope, dto.campusId);
      await assertAssignableCampus(this.prisma, churchId, dto.campusId, member.campusId);
    }
    const { ministryIds, statusIds, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (member.userId) {
        // Ficha y cuenta son la misma persona: el email es el de ingreso (no se cambia desde aquí)
        // y nombre y teléfono se mantienen iguales en ambos lados.
        delete data.email;
        await tx.user.update({
          where: { id: member.userId },
          data: { firstName: data.firstName, lastName: data.lastName, ...(data.phone !== undefined && { phone: data.phone }) },
        });
      }
      if (statusIds) {
        await tx.memberStatusAssignment.deleteMany({ where: { memberId: id, statusId: { notIn: statusIds } } });
        await tx.memberStatusAssignment.createMany({
          data: statusIds.map((statusId) => ({ statusId, memberId: id })),
          skipDuplicates: true,
        });
      }
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

  async remove(churchId: string, scope: CampusScope, id: string) {
    const member = await this.ensure(churchId, scope, id);
    if (member.userId) {
      throw new BadRequestException('El miembro tiene una cuenta de usuario. Deshabilita la cuenta o márcalo como inactivo.');
    }
    await this.prisma.member.delete({ where: { id } });
    return { ok: true };
  }

  // Familias

  families(churchId: string, scope: CampusScope) {
    const campusId = campusFilter(scope);
    return this.prisma.family.findMany({
      // Las familias no tienen sede: con acceso limitado se ven las de sus miembros y las que siguen vacías.
      where: { churchId, ...(scope && { OR: [{ members: { some: { campusId } } }, { members: { none: {} } }] }) },
      orderBy: { name: 'asc' },
      include: { members: { where: { campusId }, select: { id: true, firstName: true, lastName: true, familyRole: true } } },
    });
  }

  createFamily(churchId: string, dto: FamilyDto) {
    return this.prisma.family.create({ data: { ...dto, churchId } });
  }

  async updateFamily(churchId: string, scope: CampusScope, id: string, dto: FamilyDto) {
    await this.ensureFamily(churchId, id);
    await this.assertFamilyInScope(scope, id);
    return this.prisma.family.update({ where: { id }, data: dto });
  }

  async removeFamily(churchId: string, scope: CampusScope, id: string) {
    await this.ensureFamily(churchId, id);
    await this.assertFamilyInScope(scope, id);
    await this.prisma.family.delete({ where: { id } });
    return { ok: true };
  }

  // Ministerios

  ministries(churchId: string, scope: CampusScope) {
    const campusId = campusFilter(scope);
    return this.prisma.ministry.findMany({
      where: { churchId },
      orderBy: { name: 'asc' },
      include: {
        leader: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { members: { where: { member: { campusId } } } } },
      },
    });
  }

  async createMinistry(churchId: string, dto: MinistryDto) {
    if (dto.leaderId) await this.ensure(churchId, null, dto.leaderId);
    try {
      return await this.prisma.ministry.create({ data: { ...dto, churchId } });
    } catch (e) {
      throw this.uniqueError(e, 'Ya existe un ministerio con ese nombre');
    }
  }

  async updateMinistry(churchId: string, id: string, dto: MinistryDto) {
    await this.ensureMinistry(churchId, id);
    if (dto.leaderId) await this.ensure(churchId, null, dto.leaderId);
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

  // Estados

  memberStatuses(churchId: string, scope: CampusScope) {
    const campusId = campusFilter(scope);
    return this.prisma.memberStatus.findMany({
      where: { churchId },
      orderBy: { position: 'asc' },
      include: { _count: { select: { members: { where: { member: { campusId } } } } } },
    });
  }

  async createMemberStatus(churchId: string, dto: MemberStatusDto) {
    const last = await this.prisma.memberStatus.aggregate({ where: { churchId }, _max: { position: true } });
    try {
      return await this.prisma.memberStatus.create({ data: { ...dto, churchId, position: (last._max.position ?? -1) + 1 } });
    } catch (e) {
      throw this.uniqueError(e, 'Ya existe un estado con ese nombre');
    }
  }

  async updateMemberStatus(churchId: string, id: string, dto: MemberStatusDto) {
    await this.ensureMemberStatus(churchId, id);
    try {
      return await this.prisma.memberStatus.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.uniqueError(e, 'Ya existe un estado con ese nombre');
    }
  }

  /** Cambia el orden de los estados según la lista de ids recibida. */
  async reorderMemberStatuses(churchId: string, ids: string[]) {
    const count = await this.prisma.memberStatus.count({ where: { churchId, id: { in: ids } } });
    if (count !== ids.length) throw new BadRequestException('Estado inválido');
    await this.prisma.$transaction(ids.map((id, position) => this.prisma.memberStatus.update({ where: { id }, data: { position } })));
    return { ok: true };
  }

  async removeMemberStatus(churchId: string, id: string) {
    await this.ensureMemberStatus(churchId, id);
    await this.prisma.memberStatus.delete({ where: { id } });
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
    if (dto.statusIds?.length) {
      const count = await this.prisma.memberStatus.count({ where: { churchId, id: { in: dto.statusIds } } });
      if (count !== dto.statusIds.length) throw new BadRequestException('Estado inválido');
    }
  }

  /** Una familia compartida con otra sede solo la cambia quien ve toda la iglesia. */
  private async assertFamilyInScope(scope: CampusScope, id: string) {
    if (!scope) return;
    const others = await this.prisma.member.count({
      where: { familyId: id, OR: [{ campusId: null }, { campusId: { notIn: [...scope] } }] },
    });
    if (others > 0) throw new ForbiddenException('Esta familia tiene integrantes de otras sedes');
  }

  /** Fuera de su alcance, una ficha se comporta como si no existiera. */
  private async ensure(churchId: string, scope: CampusScope, id: string) {
    const m = await this.prisma.member.findFirst({ where: { id, churchId, campusId: campusFilter(scope) } });
    if (!m) throw new NotFoundException('Miembro no encontrado');
    return m;
  }

  private async ensureFamily(churchId: string, id: string) {
    if (!(await this.prisma.family.findFirst({ where: { id, churchId } }))) throw new NotFoundException('Familia no encontrada');
  }

  private async ensureMinistry(churchId: string, id: string) {
    if (!(await this.prisma.ministry.findFirst({ where: { id, churchId } }))) throw new NotFoundException('Ministerio no encontrado');
  }

  private async ensureMemberStatus(churchId: string, id: string) {
    if (!(await this.prisma.memberStatus.findFirst({ where: { id, churchId } }))) throw new NotFoundException('Estado no encontrado');
  }

  private uniqueError(e: unknown, message: string) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException(message);
    return e;
  }
}
