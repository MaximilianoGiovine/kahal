import { Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Permission } from '@prisma/client';
import { CookieOptions, Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { INSTAGRAM_STATE_TTL_SECONDS, InstagramService } from './instagram.service';

const STATE_COOKIE = 'kahal_ig_state';
const COOKIE_PATH = '/api/church/instagram';
const SETTINGS_PATH = '/app/configuracion';

const cookieOptions = (req: Request): CookieOptions => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: COOKIE_PATH });
const asString = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** Conexión de la cuenta de Instagram de la iglesia y sus últimas publicaciones. */
@Controller()
export class InstagramController {
  constructor(private readonly instagram: InstagramService) {}

  @Public()
  @Get('public/churches/:slug/instagram')
  posts(@Param('slug') slug: string) {
    return this.instagram.publicPosts(slug);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Get('church/instagram')
  status(@ChurchId() churchId: string) {
    return this.instagram.status(churchId);
  }

  /** Devuelve a dónde ir en lugar de redirigir: así la web renueva la sesión antes, si hace falta. */
  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Post('church/instagram/start')
  async start(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { url, cookie } = await this.instagram.begin(churchId, user.id, callbackUrl(req));
    res.cookie(STATE_COOKIE, cookie, { ...cookieOptions(req), maxAge: INSTAGRAM_STATE_TTL_SECONDS * 1000 });
    return { url };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('church/instagram/callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const cookie = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, cookieOptions(req));
    const outcome = await this.instagram.complete(cookie, callbackUrl(req), {
      code: asString(req.query.code),
      state: asString(req.query.state),
      error: asString(req.query.error),
    });
    const query = outcome.kind === 'error' ? `instagram_error=${outcome.code}` : 'instagram=connected';
    res.redirect(303, `${SETTINGS_PATH}?${query}`);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Delete('church/instagram')
  disconnect(@ChurchId() churchId: string) {
    return this.instagram.disconnect(churchId);
  }
}

/** Debe coincidir exactamente con la URI de redirección autorizada en la app de Meta. */
function callbackUrl(req: Request) {
  const host = req.get('x-forwarded-host')?.split(',')[0].trim() || req.get('host');
  return `${req.protocol}://${host}${COOKIE_PATH}/callback`;
}
