import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission, Prisma } from '@prisma/client';
import { AuthUser, coversAll, effectivePermissions, normalizePermissions } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RoleDto } from './roles.dto';

/** Nombres de los roles de un usuario, para mostrar junto a su nombre. */
export const ROLE_NAMES_SELECT = {
  roles: { select: { role: { select: { id: true, name: true } } }, orderBy: { role: { name: 'asc' } } },
} satisfies Prisma.UserSelect;

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  permissions: true,
  isAdmin: true,
  _count: { select: { users: true } },
} satisfies Prisma.ChurchRoleSelect;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list(churchId: string) {
    return this.prisma.churchRole.findMany({
      where: { churchId },
      select: ROLE_SELECT,
      orderBy: [{ isAdmin: 'desc' }, { name: 'asc' }],
    });
  }

  async create(churchId: string, actor: AuthUser, dto: RoleDto) {
    const permissions = this.grantable(actor, dto.permissions);
    await this.assertNameFree(churchId, dto.name);
    return this.prisma.churchRole.create({
      data: { churchId, name: dto.name.trim(), description: dto.description?.trim() || null, permissions },
      select: ROLE_SELECT,
    });
  }

  async update(churchId: string, actor: AuthUser, id: string, dto: RoleDto) {
    const role = await this.find(churchId, id);
    this.assertManageable(actor, role);
    if (dto.name.trim() !== role.name) await this.assertNameFree(churchId, dto.name);
    return this.prisma.churchRole.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        // Los permisos del rol de administración no se editan: siempre tiene todos.
        ...(!role.isAdmin && { permissions: this.grantable(actor, dto.permissions) }),
      },
      select: ROLE_SELECT,
    });
  }

  async remove(churchId: string, actor: AuthUser, id: string) {
    const role = await this.find(churchId, id);
    if (role.isAdmin) throw new BadRequestException('El rol de administración no se puede eliminar');
    this.assertManageable(actor, role);
    await this.prisma.churchRole.delete({ where: { id } });
    return { ok: true };
  }

  /** Normaliza los permisos y verifica que el actor no otorgue más de lo que tiene. */
  private grantable(actor: AuthUser, perms: Permission[]) {
    const permissions = normalizePermissions(perms);
    if (!coversAll(actor, permissions)) {
      throw new ForbiddenException('No podés otorgar permisos que no tenés');
    }
    return permissions;
  }

  private assertManageable(actor: AuthUser, role: { isAdmin: boolean; permissions: Permission[] }) {
    if (!coversAll(actor, effectivePermissions([role]))) {
      throw new ForbiddenException('No podés modificar un rol con más permisos que los tuyos');
    }
  }

  private async assertNameFree(churchId: string, name: string) {
    const existing = await this.prisma.churchRole.findFirst({
      where: { churchId, name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('Ya existe un rol con ese nombre');
  }

  private async find(churchId: string, id: string) {
    const role = await this.prisma.churchRole.findFirst({ where: { id, churchId } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return role;
  }
}
