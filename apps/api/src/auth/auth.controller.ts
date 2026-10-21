import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/auth.guard';
import { CurrentUser, Public } from '../common/decorators';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';
import { ACCESS_TTL_SECONDS, AuthService, REFRESH_TTL_SECONDS } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Holgado: en una iglesia muchas personas comparten la misma IP (wifi).
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookies(req, res, await this.auth.login(dto));
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      this.setCookies(req, res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      this.clearCookies(req, res);
      throw err;
    }
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.clearCookies(req, res);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.setCookies(req, res, await this.auth.changePassword(user.id, dto));
    return { ok: true };
  }

  /** "secure" según el protocolo real (detrás de Caddy, vía X-Forwarded-Proto). */
  private cookieBase(req: Request): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: req.secure };
  }

  private setCookies(req: Request, res: Response, tokens: { accessToken: string; refreshToken: string }) {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...this.cookieBase(req), path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieBase(req),
      path: '/api/auth',
      maxAge: REFRESH_TTL_SECONDS * 1000,
    });
    // Cookie no sensible que el frontend usa para saber si hay sesión (middleware de Next).
    res.cookie('kahal_session', '1', { sameSite: 'lax', secure: req.secure, path: '/', maxAge: REFRESH_TTL_SECONDS * 1000 });
  }

  private clearCookies(req: Request, res: Response) {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieBase(req), path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieBase(req), path: '/api/auth' });
    res.clearCookie('kahal_session', { path: '/' });
  }
}
