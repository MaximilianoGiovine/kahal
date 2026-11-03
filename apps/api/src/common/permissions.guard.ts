import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@prisma/client';
import { AuthUser, can } from './auth-user';
import { PERMISSIONS, SUPER_ADMIN_ONLY } from './decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const superOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_ONLY, targets);
    const perms = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS, targets);
    if (!superOnly && !perms?.length) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) return false;
    if (superOnly ? user.isSuperAdmin : can(user, ...perms)) return true;
    throw new ForbiddenException('No tenés permisos para esta acción');
  }
}
