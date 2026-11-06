import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { AllowWhenBlocked, Public } from '../common/decorators';
import { clearPendingIdentity, clearStateCookie, PENDING_COOKIE, setPendingIdentity, setSessionCookies, setStateCookie, STATE_COOKIE } from './auth-cookies';
import { OAuthFlowError, OAuthService, OAuthState, PENDING_TTL_SECONDS, ProviderSlug, STATE_TTL_SECONDS } from './oauth.service';

const PROFILE_PATH = '/app/perfil';
const asString = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const isProvider = (v: string): v is ProviderSlug => v === 'google' || v === 'apple';
/** Solo rutas internas de la app: evita usar el login para redirigir a otro sitio. */
const safeNext = (v: unknown) => {
  const next = asString(v);
  return next && /^\/app(?:[/?#]|$)/.test(next) && !next.includes('\\') ? next : undefined;
};

@AllowWhenBlocked()
@Controller('auth/oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Public()
  @Get('providers')
  providers() {
    return { google: this.oauth.isEnabled('google'), apple: this.oauth.isEnabled('apple') };
  }

  /** Datos para precompletar el registro de quien vino desde Google o Apple. */
  @Public()
  @Get('pending')
  async pending(@Req() req: Request) {
    const pending = await this.oauth.readPendingIdentity(req.cookies?.[PENDING_COOKIE]);
    if (!pending) return { pending: null };
    const { provider, email, firstName, lastName } = pending;
    return { pending: { provider, email, firstName, lastName } };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':provider/start')
  async start(@Param('provider') provider: string, @Req() req: Request & { user?: AuthUser }, @Res() res: Response) {
    const link = req.query.mode === 'link';
    if (!isProvider(provider) || !this.oauth.isEnabled(provider)) return redirect(res, link ? `${PROFILE_PATH}?oauth_error=unavailable` : '/login?oauth_error=unavailable');
    // Para conectar hace falta sesión: si venció, primero se vuelve a ingresar.
    if (link && !req.user) return redirect(res, `/login?expired=1&next=${encodeURIComponent(PROFILE_PATH)}`);

    const { url, cookie } = await this.oauth.begin(provider, callbackUrl(req, provider), {
      linkUserId: link ? req.user!.id : undefined,
      next: safeNext(req.query.next),
      iglesia: asString(req.query.iglesia),
    });
    setStateCookie(req, res, cookie, STATE_TTL_SECONDS);
    res.redirect(303, url);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':provider/callback')
  callbackGet(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response) {
    return this.finish(provider, req, res, req.query);
  }

  /** Apple responde con un POST de formulario. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':provider/callback')
  callbackPost(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response) {
    return this.finish(provider, req, res, req.body ?? {});
  }

  private async finish(provider: string, req: Request, res: Response, params: Record<string, unknown>) {
    const state = await this.oauth.readState(req.cookies?.[STATE_COOKIE]);
    clearStateCookie(req, res);
    if (!state || !isProvider(provider)) return redirect(res, errorTarget(state, 'invalid_state'));

    try {
      const outcome = await this.oauth.complete(provider, state, callbackUrl(req, provider), {
        code: asString(params.code),
        state: asString(params.state),
        error: asString(params.error),
        user: asString(params.user),
      });
      if (outcome.kind === 'linked') return redirect(res, `${PROFILE_PATH}?oauth_linked=${provider}`);
      if (outcome.kind === 'session') {
        clearPendingIdentity(req, res);
        setSessionCookies(req, res, outcome.tokens);
        return redirect(res, state.next ?? '/app');
      }
      setPendingIdentity(req, res, outcome.pending, PENDING_TTL_SECONDS);
      const query = new URLSearchParams({ social: provider, ...(state.iglesia && { iglesia: state.iglesia }) });
      return redirect(res, `/registro?${query}`);
    } catch (err) {
      if (err instanceof OAuthFlowError) return redirect(res, errorTarget(state, err.code));
      throw err;
    }
  }
}

function errorTarget(state: Pick<OAuthState, 'linkUserId' | 'iglesia'> | null, code: string) {
  if (state?.linkUserId) return `${PROFILE_PATH}?oauth_error=${code}`;
  if (state?.iglesia) return `/registro?${new URLSearchParams({ iglesia: state.iglesia, oauth_error: code })}`;
  return `/login?oauth_error=${code}`;
}

/** 303: tras el POST de Apple el navegador sigue con GET. */
function redirect(res: Response, target: string) {
  res.redirect(303, target);
}

/** Debe coincidir exactamente con la URI autorizada en la consola de Google/Apple. */
function callbackUrl(req: Request, provider: ProviderSlug) {
  const host = req.get('x-forwarded-host')?.split(',')[0].trim() || req.get('host');
  return `${req.protocol}://${host}/api/auth/oauth/${provider}/callback`;
}
