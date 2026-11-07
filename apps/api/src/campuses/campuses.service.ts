import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CampusDto, CampusSettingsDto } from './campuses.dto';

const USAGE = { select: { members: true, accounts: true, userAccess: true, announcements: true, events: true, articles: true, streams: true } };
const SETTINGS = { campusesEnabled: true, campusSeparated: true };

@Injectable()
export class CampusesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Para selectores y filtros. Los nombres ya son públicos (se eligen al registrarse), y hacen falta porque
   * una persona limitada puede ver otras sedes en las áreas compartidas; a cada área la acota su propio `campusScopes`.
   */
  async list(churchId: string, user: AuthUser) {
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: SETTINGS });
    if (!church.campusesEnabled) return { enabled: false, separated: [], items: [] };
    const limited = Object.values(user.campusScopes).find((scope) => scope !== null);
    const items = await this.prisma.campus.findMany({
      where: { churchId, ...(limited && { OR: [{ active: true }, { id: { in: [...limited] } }] }) },
      select: { id: true, name: true, city: true, active: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return { enabled: true, separated: church.campusSeparated, items };
  }

  /** Para Configuración: incluye lo necesario para decidir si archivar o eliminar. */
  async manage(churchId: string) {
    const [church, items, unassignedMembers, restrictedUsers] = await Promise.all([
      this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: SETTINGS }),
      this.prisma.campus.findMany({
        where: { churchId },
        include: { _count: USAGE },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.member.count({ where: { churchId, campusId: null } }),
      this.restrictedUsers(churchId),
    ]);
    return { enabled: church.campusesEnabled, separated: church.campusSeparated, items, unassignedMembers, restrictedUsers };
  }

  /** Apagadas, un usuario limitado seguiría limitado pero nadie podría ver ni cambiar su acceso: primero hay que quitarle el límite. */
  async settings(churchId: string, dto: CampusSettingsDto) {
    if (dto.enabled === false) {
      const restricted = await this.restrictedUsers(churchId);
      if (restricted > 0) {
        throw new ConflictException(`Hay ${restricted === 1 ? '1 usuario limitado' : `${restricted} usuarios limitados`} a ciertas sedes. Quita ese límite antes de desactivar las sedes.`);
      }
    }
    const church = await this.prisma.church.update({
      where: { id: churchId },
      data: { campusesEnabled: dto.enabled, campusSeparated: dto.separated },
      select: SETTINGS,
    });
    return { enabled: church.campusesEnabled, separated: church.campusSeparated };
  }

  async create(churchId: string, dto: CampusDto) {
    await this.assertNameFree(churchId, dto.name);
    try {
      return await this.prisma.campus.create({ data: { ...dto, name: dto.name.trim(), churchId } });
    } catch (e) {
      throw uniqueError(e);
    }
  }

  async update(churchId: string, id: string, dto: CampusDto) {
    const campus = await this.find(churchId, id);
    if (dto.name.trim().toLowerCase() !== campus.name.toLowerCase()) await this.assertNameFree(churchId, dto.name);
    try {
      return await this.prisma.campus.update({ where: { id }, data: { ...dto, name: dto.name.trim() } });
    } catch (e) {
      throw uniqueError(e);
    }
  }

  async remove(churchId: string, id: string) {
    const campus = await this.prisma.campus.findFirst({
      where: { id, churchId },
      include: { _count: USAGE },
    });
    if (!campus) throw new NotFoundException('Sede no encontrada');
    if (Object.values(campus._count).some((n) => n > 0)) throw inUse();
    try {
      await this.prisma.campus.delete({ where: { id } });
    } catch (e) {
      // Se le asignó algo entre la verificación y el borrado: lo frena la clave foránea.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw inUse();
      throw e;
    }
    return { ok: true };
  }

  /** Pensado para el arranque: una iglesia que ya tiene su padrón y abre su primera sede. */
  async assignUnassigned(churchId: string, id: string) {
    const campus = await this.find(churchId, id);
    if (!campus.active) throw new ConflictException('Esa sede está archivada');
    const { count } = await this.prisma.member.updateMany({ where: { churchId, campusId: null }, data: { campusId: id } });
    return { count };
  }

  private restrictedUsers(churchId: string) {
    return this.prisma.user.count({ where: { churchId, campusRestricted: true } });
  }

  private async assertNameFree(churchId: string, name: string) {
    const existing = await this.prisma.campus.findFirst({ where: { churchId, name: { equals: name.trim(), mode: 'insensitive' } } });
    if (existing) throw new ConflictException('Ya existe una sede con ese nombre');
  }

  private async find(churchId: string, id: string) {
    const campus = await this.prisma.campus.findFirst({ where: { id, churchId } });
    if (!campus) throw new NotFoundException('Sede no encontrada');
    return campus;
  }
}

const inUse = () => new ConflictException('La sede tiene miembros, cuentas, usuarios o publicaciones asignados. Puedes archivarla o reasignarlos antes de eliminarla.');

function uniqueError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException('Ya existe una sede con ese nombre');
  return e;
}
