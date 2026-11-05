import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AuthUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS = 'permissions';
/** El super admin siempre pasa; el resto necesita al menos uno de los permisos. */
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS, perms);

export const SUPER_ADMIN_ONLY = 'superAdminOnly';
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_ONLY, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

/** Id de la iglesia sobre la que opera la request. Falla si no hay ninguna. */
export const ChurchId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
  if (!user?.activeChurchId) {
    throw new BadRequestException('Selecciona una iglesia para operar');
  }
  return user.activeChurchId;
});
