import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, effectivePermissions } from './auth-user';
import { IS_PUBLIC } from './decorators';

export const ACCESS_COOKIE = 'kahal_at';
export const REFRESH_COOKIE = 'kahal_rt';

export interface AccessPayload {
  sub: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractToken(req);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    // Los permisos se leen en cada request: un cambio de roles aplica al instante.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        isSuperAdmin: true,
        churchId: true,
        status: true,
        roles: { select: { role: { select: { isAdmin: true, permissions: true } } } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    let activeChurchId = user.churchId;
    if (user.isSuperAdmin) {
      const header = req.headers['x-church-id'];
      activeChurchId = (Array.isArray(header) ? header[0] : header) || null;
    }
    req.user = {
      id: payload.sub,
      isSuperAdmin: user.isSuperAdmin,
      churchId: user.churchId,
      activeChurchId,
      permissions: effectivePermissions(user.roles.map((r) => r.role)),
    };
    return true;
  }
}

function extractToken(req: Request): string | undefined {
  const cookie = req.cookies?.[ACCESS_COOKIE];
  if (cookie) return cookie;
  const [type, value] = req.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' ? value : undefined;
}
