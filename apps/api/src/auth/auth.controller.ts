import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthProvider } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { REFRESH_COOKIE } from '../common/auth.guard';
import { CurrentUser, Public } from '../common/decorators';
import { ChangePasswordDto, EmailQuery, LoginDto, RegisterDto } from './auth.dto';
import { clearPendingIdentity, clearSessionCookies, PENDING_COOKIE, setSessionCookies } from './auth-cookies';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
  ) {}

  @Public()
  // Holgado: en una iglesia muchas personas comparten la misma IP (wifi).
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    setSessionCookies(req, res, await this.auth.login(dto));
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const identity = await this.oauth.readPendingIdentity(req.cookies?.[PENDING_COOKIE]);
    setSessionCookies(req, res, await this.auth.register(dto, identity));
    clearPendingIdentity(req, res);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('email-available')
  emailAvailable(@Query() q: EmailQuery) {
    return this.auth.emailAvailable(q.email);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      setSessionCookies(req, res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      // Solo una sesión inválida cierra la sesión; un error transitorio (DB caída, etc.) no.
      if (err instanceof UnauthorizedException) clearSessionCookies(req, res);
      throw err;
    }
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    clearSessionCookies(req, res);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    setSessionCookies(req, res, await this.auth.changePassword(user.id, dto));
    return { ok: true };
  }

  @Delete('identities/:provider')
  unlinkIdentity(@CurrentUser() user: AuthUser, @Param('provider') provider: string) {
    const key = provider.toUpperCase();
    if (key !== AuthProvider.GOOGLE && key !== AuthProvider.APPLE) throw new BadRequestException('Proveedor inválido');
    return this.auth.unlinkIdentity(user.id, key);
  }
}
