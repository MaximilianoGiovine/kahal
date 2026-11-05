import { CookieOptions, Request, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/auth.guard';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from './auth.service';

/** Estado firmado de un inicio de sesión con Google/Apple en curso. */
export const STATE_COOKIE = 'kahal_oauth';
/** Cuenta de Google/Apple verificada que todavía tiene que completar el registro. */
export const PENDING_COOKIE = 'kahal_oauth_pending';

const OAUTH_PATH = '/api/auth';

/** "secure" según el protocolo real (detrás de Caddy, vía X-Forwarded-Proto). */
function cookieBase(req: Request): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: req.secure };
}

export function setSessionCookies(req: Request, res: Response, tokens: { accessToken: string; refreshToken: string }) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...cookieBase(req), path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieBase(req), path: '/api/auth', maxAge: REFRESH_TTL_SECONDS * 1000 });
  // Cookie no sensible que el frontend usa para saber si hay sesión (middleware de Next).
  res.cookie('kahal_session', '1', { sameSite: 'lax', secure: req.secure, path: '/', maxAge: REFRESH_TTL_SECONDS * 1000 });
}

export function clearSessionCookies(req: Request, res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase(req), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(req), path: '/api/auth' });
  res.clearCookie('kahal_session', { path: '/' });
}

/**
 * Apple vuelve con un POST desde otro sitio: una cookie SameSite=Lax no viajaría,
 * así que en HTTPS el estado usa SameSite=None. Sigue atado a este navegador y firmado.
 */
function stateCookieOptions(req: Request): CookieOptions {
  return { ...cookieBase(req), sameSite: req.secure ? 'none' : 'lax', path: OAUTH_PATH };
}

export function setStateCookie(req: Request, res: Response, value: string, ttlSeconds: number) {
  res.cookie(STATE_COOKIE, value, { ...stateCookieOptions(req), maxAge: ttlSeconds * 1000 });
}

export function clearStateCookie(req: Request, res: Response) {
  res.clearCookie(STATE_COOKIE, stateCookieOptions(req));
}

export function setPendingIdentity(req: Request, res: Response, value: string, ttlSeconds: number) {
  res.cookie(PENDING_COOKIE, value, { ...cookieBase(req), path: OAUTH_PATH, maxAge: ttlSeconds * 1000 });
}

export function clearPendingIdentity(req: Request, res: Response) {
  res.clearCookie(PENDING_COOKIE, { ...cookieBase(req), path: OAUTH_PATH });
}
