import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { SecretBox } from '../common/secret-box';
import { PrismaService } from '../prisma/prisma.service';
import { FacebookLive, FacebookPageAccess, FacebookTokenError } from './live-platforms';

export const FACEBOOK_STATE_TTL_SECONDS = 10 * 60;
export const FACEBOOK_CHOICE_TTL_SECONDS = 15 * 60;

interface FacebookState {
  state: string;
  churchId: string;
  userId: string;
}

interface FacebookChoice {
  churchId: string;
  userId: string;
  pages: FacebookPageAccess[];
}

export type FacebookConnectOutcome = { kind: 'connected'; name: string } | { kind: 'choose'; choice: string } | { kind: 'error'; code: 'cancelled' | 'no_pages' | 'provider_error' };

/** Comparación del enlace configurado con el de la página, sin www, mayúsculas ni barra final. */
function samePage(url: string | null, page: FacebookPageAccess) {
  if (!url) return false;
  const norm = (v: string) => {
    try {
      const u = new URL(v);
      const id = u.searchParams.get('id');
      return id ?? u.pathname.replace(/\/+$/, '').toLowerCase();
    } catch {
      return v;
    }
  };
  const target = norm(url);
  return target === page.id || target === `/${page.id}` || (!!page.link && target === norm(page.link));
}

@Injectable()
export class FacebookPageService {
  private readonly logger = new Logger(FacebookPageService.name);
  private readonly box: SecretBox;
  private readonly stateSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly facebook: FacebookLive,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const secret = config.getOrThrow<string>('JWT_SECRET');
    this.box = new SecretBox(secret, 'facebook-page-token');
    this.stateSecret = `${secret}:facebook-state`;
  }

  get configured() {
    return this.facebook.configured;
  }

  async status(churchId: string) {
    const page = await this.prisma.facebookPage.findUnique({ where: { churchId }, select: { pageId: true, name: true, invalidAt: true } });
    return { available: this.configured, page: page && { id: page.pageId, name: page.name, invalid: !!page.invalidAt } };
  }

  async begin(churchId: string, userId: string, callbackUrl: string) {
    if (!this.configured) throw new BadRequestException('La conexión con Facebook no está habilitada en este servidor');
    const state: FacebookState = { state: randomBytes(24).toString('base64url'), churchId, userId };
    return {
      url: this.facebook.authorizeUrl(callbackUrl, state.state),
      cookie: await this.jwt.signAsync(state, { secret: this.stateSecret, expiresIn: FACEBOOK_STATE_TTL_SECONDS }),
    };
  }

  async complete(cookie: string | undefined, callbackUrl: string, response: { code?: string; state?: string; error?: string }): Promise<FacebookConnectOutcome> {
    const state = cookie ? await this.jwt.verifyAsync<FacebookState>(cookie, { secret: this.stateSecret }).catch(() => null) : null;
    // El state ata la respuesta al navegador que inició la conexión: nadie puede conectar su página a otra iglesia.
    if (!state || !response.state || response.state !== state.state) return { kind: 'error', code: 'provider_error' };
    if (response.error) return { kind: 'error', code: response.error === 'access_denied' ? 'cancelled' : 'provider_error' };
    if (!response.code) return { kind: 'error', code: 'provider_error' };

    let pages: FacebookPageAccess[];
    try {
      pages = await this.facebook.pages(response.code, callbackUrl);
    } catch (e) {
      this.logger.warn(`No se pudieron obtener las páginas de Facebook: ${e instanceof Error ? e.message : e}`);
      return { kind: 'error', code: 'provider_error' };
    }
    if (pages.length === 0) return { kind: 'error', code: 'no_pages' };

    const church = await this.prisma.church.findUnique({ where: { id: state.churchId }, select: { facebookUrl: true } });
    const match = pages.length === 1 ? pages[0] : pages.find((p) => samePage(church?.facebookUrl ?? null, p));
    if (match) {
      await this.save(state.churchId, state.userId, match);
      return { kind: 'connected', name: match.name };
    }
    const choice: FacebookChoice = { churchId: state.churchId, userId: state.userId, pages };
    return { kind: 'choose', choice: this.box.seal(JSON.stringify({ ...choice, exp: Date.now() + FACEBOOK_CHOICE_TTL_SECONDS * 1000 })) };
  }

  /** Páginas para elegir, sin sus tokens. */
  pagesToChoose(churchId: string, cookie: string | undefined) {
    return (this.readChoice(churchId, cookie)?.pages ?? []).map(({ id, name }) => ({ id, name }));
  }

  async choose(churchId: string, cookie: string | undefined, pageId: string) {
    const choice = this.readChoice(churchId, cookie);
    const page = choice?.pages.find((p) => p.id === pageId);
    if (!choice || !page) throw new BadRequestException('La selección venció. Vuelve a conectar la página de Facebook.');
    await this.save(churchId, choice.userId, page);
    return this.status(churchId);
  }

  async disconnect(churchId: string) {
    await this.prisma.facebookPage.deleteMany({ where: { churchId } });
    return { ok: true };
  }

  /** Transmisiones en curso de una página conectada. */
  liveVideos(page: { pageId: string; token: string }) {
    const token = this.box.open(page.token);
    // Cifrado con otro JWT_SECRET: hay que volver a conectarla.
    if (!token) throw new FacebookTokenError('No se pudo descifrar el token de la página de Facebook');
    return this.facebook.liveVideos(page.pageId, token);
  }

  async markInvalid(churchId: string) {
    await this.prisma.facebookPage.updateMany({ where: { churchId, invalidAt: null }, data: { invalidAt: new Date() } });
  }

  private readChoice(churchId: string, cookie: string | undefined): FacebookChoice | null {
    const raw = cookie && this.box.open(cookie);
    if (!raw) return null;
    const choice = JSON.parse(raw) as FacebookChoice & { exp: number };
    return choice.churchId === churchId && choice.exp > Date.now() ? choice : null;
  }

  private async save(churchId: string, userId: string, page: FacebookPageAccess) {
    const data = { pageId: page.id, name: page.name, token: this.box.seal(page.token), invalidAt: null, connectedById: userId };
    await this.prisma.$transaction([
      this.prisma.facebookPage.upsert({ where: { churchId }, create: { churchId, ...data }, update: data }),
      // Si la iglesia no tenía su página cargada, queda la que acaba de conectar.
      this.prisma.church.updateMany({ where: { id: churchId, facebookUrl: null }, data: { facebookUrl: page.link ?? `https://www.facebook.com/${page.id}` } }),
    ]);
  }
}
