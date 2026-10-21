import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** SUPER_ADMIN siempre pasa; el resto debe estar en la lista. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

/** Id de la iglesia sobre la que opera la request. Falla si no hay ninguna. */
export const ChurchId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
  if (!user?.activeChurchId) {
    throw new BadRequestException('Seleccioná una iglesia para operar');
  }
  return user.activeChurchId;
});
