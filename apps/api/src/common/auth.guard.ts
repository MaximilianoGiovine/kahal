import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { AuthUser } from './auth-user';
import { IS_PUBLIC } from './decorators';

export const ACCESS_COOKIE = 'kahal_at';
export const REFRESH_COOKIE = 'kahal_rt';

export interface AccessPayload {
  sub: string;
  role: Role;
  churchId: string | null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
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

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      let activeChurchId = payload.churchId;
      if (payload.role === Role.SUPER_ADMIN) {
        const header = req.headers['x-church-id'];
        activeChurchId = (Array.isArray(header) ? header[0] : header) || null;
      }
      req.user = { id: payload.sub, role: payload.role, churchId: payload.churchId, activeChurchId };
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }
    return true;
  }
}

function extractToken(req: Request): string | undefined {
  const cookie = req.cookies?.[ACCESS_COOKIE];
  if (cookie) return cookie;
  const [type, value] = req.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' ? value : undefined;
}
