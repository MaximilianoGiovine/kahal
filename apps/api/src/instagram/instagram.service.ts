import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { SecretBox } from '../common/secret-box';
import { PrismaService } from '../prisma/prisma.service';
import { InstagramClient, InstagramPost, InstagramTokenError } from './instagram.client';

export const INSTAGRAM_STATE_TTL_SECONDS = 10 * 60;
/** Publicaciones que se muestran. */
const POSTS = 4;
/** Cada cuánto se vuelve a consultar Instagram. Sus enlaces a imágenes vencen a los pocos días: no conviene guardarlos mucho. */
const CACHE_MS = 30 * 60_000;
/** Se renueva el token cuando le quedan menos de estos días (vence a los 60). */
const REFRESH_BEFORE_DAYS = 20;

interface InstagramState {
  state: string;
  churchId: string;
  userId: string;
}

export type InstagramConnectOutcome = { kind: 'connected'; username: string } | { kind: 'error'; code: 'cancelled' | 'provider_error' };

/** Últimas publicaciones de la cuenta de Instagram de la iglesia, para su página pública. */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly box: SecretBox;
  private readonly stateSecret: string;
  /** Una sola consulta a la vez por iglesia, aunque lleguen muchas visitas juntas. */
  private readonly inflight = new Map<string, Promise<InstagramPost[]>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: InstagramClient,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const secret = config.getOrThrow<string>('JWT_SECRET');
    this.box = new SecretBox(secret, 'instagram-token');
    this.stateSecret = `${secret}:instagram-state`;
  }

  async status(churchId: string) {
    const account = await this.prisma.instagramAccount.findUnique({ where: { churchId }, select: { username: true, invalidAt: true } });
    return { available: this.client.configured, account: account && { username: account.username, invalid: !!account.invalidAt } };
  }

  async begin(churchId: string, userId: string, callbackUrl: string) {
    if (!this.client.configured) throw new BadRequestException('La conexión con Instagram no está habilitada en este servidor');
    const state: InstagramState = { state: randomBytes(24).toString('base64url'), churchId, userId };
    return {
      url: this.client.authorizeUrl(callbackUrl, state.state),
      cookie: await this.jwt.signAsync(state, { secret: this.stateSecret, expiresIn: INSTAGRAM_STATE_TTL_SECONDS }),
    };
  }

  async complete(cookie: string | undefined, callbackUrl: string, response: { code?: string; state?: string; error?: string }): Promise<InstagramConnectOutcome> {
    const state = cookie ? await this.jwt.verifyAsync<InstagramState>(cookie, { secret: this.stateSecret }).catch(() => null) : null;
    // El state ata la respuesta al navegador que inició la conexión: nadie puede conectar su cuenta a otra iglesia.
    if (!state || !response.state || response.state !== state.state) return { kind: 'error', code: 'provider_error' };
    if (response.error) return { kind: 'error', code: response.error === 'access_denied' ? 'cancelled' : 'provider_error' };
    if (!response.code) return { kind: 'error', code: 'provider_error' };
    try {
      const account = await this.client.connect(response.code, callbackUrl);
      const data = {
        igUserId: account.igUserId,
        username: account.username,
        token: this.box.seal(account.token),
        tokenExpiresAt: account.expiresAt,
        invalidAt: null,
        media: Prisma.DbNull,
        mediaFetchedAt: null,
        connectedById: state.userId,
      };
      await this.prisma.instagramAccount.upsert({ where: { churchId: state.churchId }, create: { churchId: state.churchId, ...data }, update: data });
      return { kind: 'connected', username: account.username };
    } catch (e) {
      this.logger.warn(`No se pudo conectar la cuenta de Instagram: ${e instanceof Error ? e.message : e}`);
      return { kind: 'error', code: 'provider_error' };
    }
  }

  async disconnect(churchId: string) {
    await this.prisma.instagramAccount.deleteMany({ where: { churchId } });
    return { ok: true };
  }

  /** Para la página pública. Si Instagram falla, devuelve lo último que se obtuvo; si no hay cuenta, nada. */
  async publicPosts(slug: string) {
    const church = await this.prisma.church.findFirst({ where: { slug, active: true, deletionScheduledFor: null }, select: { id: true } });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    const account = await this.prisma.instagramAccount.findUnique({ where: { churchId: church.id } });
    if (!account) return { username: null, posts: [] };
    const cached = (account.media as InstagramPost[] | null) ?? [];
    const fresh = account.mediaFetchedAt && Date.now() - account.mediaFetchedAt.getTime() < CACHE_MS;
    if (fresh || account.invalidAt || !this.client.configured) return { username: account.username, posts: account.invalidAt ? [] : cached };

    let pending = this.inflight.get(church.id);
    if (!pending) {
      pending = this.fetchPosts(church.id, account.token).finally(() => this.inflight.delete(church.id));
      this.inflight.set(church.id, pending);
    }
    const posts = await pending.catch(() => cached);
    return { username: account.username, posts };
  }

  private async fetchPosts(churchId: string, sealed: string) {
    const token = this.box.open(sealed);
    try {
      // Cifrado con otro JWT_SECRET: hay que volver a conectarla.
      if (!token) throw new InstagramTokenError('No se pudo descifrar el token de Instagram');
      const posts = await this.client.recentMedia(token, POSTS);
      await this.prisma.instagramAccount.updateMany({ where: { churchId }, data: { media: posts as unknown as Prisma.InputJsonValue, mediaFetchedAt: new Date() } });
      return posts;
    } catch (e) {
      if (e instanceof InstagramTokenError) {
        await this.prisma.instagramAccount.updateMany({ where: { churchId, invalidAt: null }, data: { invalidAt: new Date() } });
        return [];
      }
      // Instagram no respondió: se reintenta en unos minutos en vez de en cada visita.
      await this.prisma.instagramAccount.updateMany({ where: { churchId }, data: { mediaFetchedAt: new Date(Date.now() - CACHE_MS + 5 * 60_000) } });
      this.logger.warn(`No se pudieron leer las publicaciones de Instagram de ${churchId}: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  /** Los tokens vencen a los 60 días: se renuevan solos mientras la cuenta siga conectada. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async refreshTokens() {
    if (!this.client.configured) return;
    const due = await this.prisma.instagramAccount.findMany({
      where: {
        invalidAt: null,
        // Vencer en menos de 20 días implica tener más de 24 horas, lo mínimo que pide Instagram para renovar.
        tokenExpiresAt: { gt: new Date(), lt: new Date(Date.now() + REFRESH_BEFORE_DAYS * 86_400_000) },
      },
      select: { churchId: true, token: true },
    });
    for (const account of due) {
      const token = this.box.open(account.token);
      try {
        if (!token) throw new InstagramTokenError('No se pudo descifrar el token de Instagram');
        const fresh = await this.client.refresh(token);
        await this.prisma.instagramAccount.update({ where: { churchId: account.churchId }, data: { token: this.box.seal(fresh.token), tokenExpiresAt: fresh.expiresAt } });
      } catch (e) {
        if (e instanceof InstagramTokenError) await this.prisma.instagramAccount.update({ where: { churchId: account.churchId }, data: { invalidAt: new Date() } });
        this.logger.warn(`No se pudo renovar el token de Instagram de ${account.churchId}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}
