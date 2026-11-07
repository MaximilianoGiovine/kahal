import { Body, Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Permission } from '@prisma/client';
import { IsString } from 'class-validator';
import { CookieOptions, Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { FACEBOOK_CHOICE_TTL_SECONDS, FACEBOOK_STATE_TTL_SECONDS, FacebookPageService } from './facebook-page.service';

const STATE_COOKIE = 'kahal_fb_state';
const CHOICE_COOKIE = 'kahal_fb_pages';
const COOKIE_PATH = '/api/church/facebook';
const SETTINGS_PATH = '/app/configuracion';

class ChoosePageDto {
  @IsString() pageId!: string;
}

const cookieOptions = (req: Request): CookieOptions => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: COOKIE_PATH });
const asString = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** Conexión de la página de Facebook de la iglesia, para publicar sola sus transmisiones en vivo. */
@Controller('church/facebook')
export class FacebookPageController {
  constructor(private readonly pages: FacebookPageService) {}

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Get()
  status(@ChurchId() churchId: string) {
    return this.pages.status(churchId);
  }

  /** Devuelve a dónde ir en lugar de redirigir: así la web renueva la sesión antes, si hace falta. */
  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Post('start')
  async start(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { url, cookie } = await this.pages.begin(churchId, user.id, callbackUrl(req));
    res.cookie(STATE_COOKIE, cookie, { ...cookieOptions(req), maxAge: FACEBOOK_STATE_TTL_SECONDS * 1000 });
    return { url };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const cookie = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, cookieOptions(req));
    const outcome = await this.pages.complete(cookie, callbackUrl(req), {
      code: asString(req.query.code),
      state: asString(req.query.state),
      error: asString(req.query.error),
    });
    if (outcome.kind === 'choose') res.cookie(CHOICE_COOKIE, outcome.choice, { ...cookieOptions(req), maxAge: FACEBOOK_CHOICE_TTL_SECONDS * 1000 });
    const query = outcome.kind === 'error' ? `facebook_error=${outcome.code}` : `facebook=${outcome.kind}`;
    res.redirect(303, `${SETTINGS_PATH}?${query}`);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Get('pages')
  pagesToChoose(@ChurchId() churchId: string, @Req() req: Request) {
    return this.pages.pagesToChoose(churchId, req.cookies?.[CHOICE_COOKIE]);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Post('page')
  async choose(@ChurchId() churchId: string, @Body() dto: ChoosePageDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const status = await this.pages.choose(churchId, req.cookies?.[CHOICE_COOKIE], dto.pageId);
    res.clearCookie(CHOICE_COOKIE, cookieOptions(req));
    return status;
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Delete()
  disconnect(@ChurchId() churchId: string) {
    return this.pages.disconnect(churchId);
  }
}

/** Debe coincidir exactamente con la URI autorizada en la app de Meta. */
function callbackUrl(req: Request) {
  const host = req.get('x-forwarded-host')?.split(',')[0].trim() || req.get('host');
  return `${req.protocol}://${host}${COOKIE_PATH}/callback`;
}
