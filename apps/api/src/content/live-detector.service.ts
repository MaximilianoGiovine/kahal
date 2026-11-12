import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CampusAspect, Prisma, StreamPlatform } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { separates } from '../common/campus-scope';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { takeLiveLock } from './content.service';
import { FacebookPageService } from './facebook-page.service';
import { FacebookTokenError, TwitchLive, YouTubeLive } from './live-platforms';

/**
 * Revisiones seguidas sin la transmisión antes de darla por terminada, con una revisión por minuto.
 * YouTube informa el estado del video y basta una. Twitch deja de listar un canal durante un corte breve: se esperan unos 6 minutos.
 */
const MISSES_TO_END: Record<string, number> = { [StreamPlatform.YOUTUBE]: 1, [StreamPlatform.TWITCH]: 6, [StreamPlatform.FACEBOOK]: 4 };
/** Una transmisión que se reinicia tras un corte no vuelve a avisar a toda la iglesia. */
const RESTART_MS = 30 * 60_000;
/** Margen para reconocer una transmisión programada a mano como la que acaba de empezar. */
const PLANNED_MS = 12 * 3600_000;
const FEED_CONCURRENCY = 5;

const PAGE_SELECT = { churchId: true, pageId: true, token: true, invalidAt: true } satisfies Prisma.FacebookPageSelect;
const CHURCH_SELECT = {
  id: true,
  name: true,
  youtubeUrl: true,
  twitchUrl: true,
  facebookUrl: true,
  facebookPage: { select: PAGE_SELECT },
  ignoredLiveIds: true,
  campusesEnabled: true,
  campusSeparated: true,
} satisfies Prisma.ChurchSelect;
type ConnectedPage = Prisma.FacebookPageGetPayload<{ select: typeof PAGE_SELECT }>;
type DetectChurch = Prisma.ChurchGetPayload<{ select: typeof CHURCH_SELECT }>;
type Tracked = { id: string; churchId: string; platform: StreamPlatform; externalId: string | null; url: string };

interface Broadcast {
  platform: StreamPlatform;
  externalId: string;
  title: string;
  url: string;
  channelUrl: string;
  startedAt: Date | null;
}

/** `stillLive` es null si la plataforma no respondió: sin esa certeza no se termina nada. */
interface PlatformCheck {
  byChurch: Map<string, Broadcast[]>;
  stillLive: Set<string> | null;
}

/** Comparación de enlaces de canal, sin www, mayúsculas ni parámetros. */
function sameChannel(a: string, b: string) {
  const norm = (url: string) => {
    try {
      const u = new URL(url);
      return `${u.hostname.replace(/^www\.|^m\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      return url;
    }
  };
  return norm(a) === norm(b);
}

/**
 * Publica sola la transmisión cuando el canal de YouTube, Twitch o Facebook de una iglesia empieza a emitir, y la termina cuando corta.
 * `LiveStream.externalId` marca lo que sigue este servicio. Lo publicado a mano no se toca, salvo que sea la misma transmisión.
 */
@Injectable()
export class LiveDetectorService {
  private readonly logger = new Logger(LiveDetectorService.name);
  private running = false;
  /** Videos del feed que ya se sabe que no son transmisiones en curso: no gastan cuota otra vez. */
  private finished = new Set<string>();
  private misses = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtube: YouTubeLive,
    private readonly twitch: TwitchLive,
    private readonly push: PushService,
    private readonly billing: BillingService,
    private readonly facebook: FacebookPageService,
  ) {}

  get availability() {
    return { youtube: this.youtube.configured, twitch: this.twitch.configured, facebook: this.facebook.configured };
  }

  @Cron('* * * * *')
  async detect() {
    if (this.running || (!this.youtube.configured && !this.twitch.configured && !this.facebook.configured)) return;
    this.running = true;
    try {
      const tracked = await this.prisma.liveStream.findMany({
        where: { isLive: true, externalId: { not: null } },
        select: { id: true, churchId: true, platform: true, externalId: true, url: true },
      });
      const churches = await this.eligibleChurches();
      const [youtube, twitch, facebook] = await Promise.all([this.checkYouTube(churches, tracked), this.checkTwitch(churches, tracked), this.checkFacebook(churches, tracked)]);
      await this.closeEnded(tracked, { [StreamPlatform.YOUTUBE]: youtube.stillLive, [StreamPlatform.TWITCH]: twitch.stillLive, [StreamPlatform.FACEBOOK]: facebook.stillLive });
      for (const church of churches) {
        const found = [youtube, twitch, facebook].flatMap((check) => check.byChurch.get(church.id) ?? []);
        for (const broadcast of found) {
          await this.start(church, broadcast).catch((e) => this.logger.error(`Falló la transmisión automática de la iglesia ${church.id}: ${this.reason(e)}`));
        }
      }
    } catch (e) {
      this.logger.error(`Falló la detección de transmisiones: ${this.reason(e)}`);
    } finally {
      this.running = false;
    }
  }

  private async eligibleChurches(): Promise<DetectChurch[]> {
    const channels: Prisma.ChurchWhereInput[] = [];
    if (this.youtube.configured) channels.push({ youtubeUrl: { not: null } });
    if (this.twitch.configured) channels.push({ twitchUrl: { not: null } });
    if (this.facebook.configured) channels.push({ facebookPage: { is: { invalidAt: null } } });
    const churches = await this.prisma.church.findMany({
      where: { active: true, deletionScheduledFor: null, autoLiveEnabled: true, OR: channels },
      select: CHURCH_SELECT,
    });
    const blocked = await Promise.all(churches.map((c) => this.billing.isBlocked(c.id)));
    return churches.filter((_, i) => !blocked[i]);
  }

  private async checkYouTube(churches: DetectChurch[], tracked: Tracked[]): Promise<PlatformCheck> {
    const byChurch = new Map<string, Broadcast[]>();
    if (!this.youtube.configured) return { byChurch, stillLive: null };

    const churchesByChannel = new Map<string, DetectChurch[]>();
    for (const church of churches) {
      if (!church.youtubeUrl) continue;
      const channelId = await this.youtube.channelId(church.youtubeUrl).catch((e) => void this.logger.warn(this.reason(e)));
      if (channelId) churchesByChannel.set(channelId, [...(churchesByChannel.get(channelId) ?? []), church]);
    }

    const feedIds = new Set<string>();
    const channelIds = [...churchesByChannel.keys()];
    for (let i = 0; i < channelIds.length; i += FEED_CONCURRENCY) {
      const feeds = await Promise.allSettled(channelIds.slice(i, i + FEED_CONCURRENCY).map((id) => this.youtube.feedVideoIds(id)));
      for (const feed of feeds) {
        if (feed.status === 'fulfilled') feed.value.forEach((id) => feedIds.add(id));
        else this.logger.warn(this.reason(feed.reason));
      }
    }

    const trackedIds = tracked.filter((t) => t.platform === StreamPlatform.YOUTUBE).map((t) => t.externalId!);
    const ids = [...new Set([...feedIds, ...trackedIds])].filter((id) => !this.finished.has(id));
    let videos;
    try {
      videos = ids.length ? await this.youtube.videos(ids) : [];
    } catch (e) {
      this.logger.warn(this.reason(e));
      return { byChurch, stillLive: null };
    }

    const stillLive = new Set<string>();
    const states = new Map(videos.map((v) => [v.id, v.state]));
    // Lo que sale del feed se olvida, para que la memoria no crezca. Lo borrado o privado tampoco vuelve a consultarse.
    this.finished = new Set([...feedIds].filter((id) => this.finished.has(id) || (states.get(id) ?? 'none') === 'none'));
    for (const video of videos) {
      if (video.state !== 'live') continue;
      stillLive.add(video.id);
      for (const church of churchesByChannel.get(video.channelId) ?? []) {
        const broadcast: Broadcast = {
          platform: StreamPlatform.YOUTUBE,
          externalId: video.id,
          title: video.title,
          url: `https://www.youtube.com/watch?v=${video.id}`,
          channelUrl: church.youtubeUrl!,
          startedAt: video.startedAt,
        };
        byChurch.set(church.id, [...(byChurch.get(church.id) ?? []), broadcast]);
      }
    }
    return { byChurch, stillLive };
  }

  private async checkTwitch(churches: DetectChurch[], tracked: Tracked[]): Promise<PlatformCheck> {
    const byChurch = new Map<string, Broadcast[]>();
    if (!this.twitch.configured) return { byChurch, stillLive: null };

    const churchesByLogin = new Map<string, DetectChurch[]>();
    for (const church of churches) {
      const login = church.twitchUrl && this.twitch.login(church.twitchUrl);
      if (login) churchesByLogin.set(login, [...(churchesByLogin.get(login) ?? []), church]);
    }
    const trackedLogins = tracked.filter((t) => t.platform === StreamPlatform.TWITCH).flatMap((t) => this.twitch.login(t.url) ?? []);
    const logins = [...new Set([...churchesByLogin.keys(), ...trackedLogins])];
    let streams;
    try {
      streams = logins.length ? await this.twitch.streams(logins) : [];
    } catch (e) {
      this.logger.warn(this.reason(e));
      return { byChurch, stillLive: null };
    }

    for (const stream of streams) {
      for (const church of churchesByLogin.get(stream.login) ?? []) {
        const broadcast: Broadcast = {
          platform: StreamPlatform.TWITCH,
          externalId: stream.id,
          title: stream.title || church.name,
          url: `https://www.twitch.tv/${stream.login}`,
          channelUrl: church.twitchUrl!,
          startedAt: stream.startedAt,
        };
        byChurch.set(church.id, [...(byChurch.get(church.id) ?? []), broadcast]);
      }
    }
    return { byChurch, stillLive: new Set(streams.map((s) => s.id)) };
  }

  private async checkFacebook(churches: DetectChurch[], tracked: Tracked[]): Promise<PlatformCheck> {
    const byChurch = new Map<string, Broadcast[]>();
    if (!this.facebook.configured) return { byChurch, stillLive: null };

    const pages = new Map<string, ConnectedPage>();
    for (const church of churches) if (church.facebookPage && !church.facebookPage.invalidAt) pages.set(church.id, church.facebookPage);
    // Lo que ya se publicó se sigue revisando aunque la iglesia haya apagado la detección, para saber cuándo termina.
    const trackedChurches = tracked.filter((t) => t.platform === StreamPlatform.FACEBOOK && !pages.has(t.churchId)).map((t) => t.churchId);
    if (trackedChurches.length) {
      const extra = await this.prisma.facebookPage.findMany({ where: { churchId: { in: trackedChurches }, invalidAt: null }, select: PAGE_SELECT });
      for (const page of extra) pages.set(page.churchId, page);
    }

    const stillLive = new Set<string>();
    const entries = [...pages.values()];
    for (let i = 0; i < entries.length; i += FEED_CONCURRENCY) {
      const batch = entries.slice(i, i + FEED_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((page) => this.facebookLive(page)));
      results.forEach((result, j) => {
        const page = batch[j];
        if (result.status === 'rejected') {
          this.logger.warn(this.reason(result.reason));
          // Sin respuesta de esa página no se da por terminado lo suyo.
          for (const t of tracked) if (t.platform === StreamPlatform.FACEBOOK && t.churchId === page.churchId && !(result.reason instanceof FacebookTokenError)) stillLive.add(t.externalId!);
          return;
        }
        const church = churches.find((c) => c.id === page.churchId);
        for (const live of result.value) {
          stillLive.add(live.id);
          if (!church) continue;
          const broadcast: Broadcast = {
            platform: StreamPlatform.FACEBOOK,
            externalId: live.id,
            title: live.title || church.name,
            url: `https://www.facebook.com/${page.pageId}/videos/${live.videoId ?? live.id}/`,
            channelUrl: church.facebookUrl ?? `https://www.facebook.com/${page.pageId}`,
            startedAt: live.startedAt,
          };
          byChurch.set(church.id, [...(byChurch.get(church.id) ?? []), broadcast]);
        }
      });
    }
    return { byChurch, stillLive };
  }

  private async facebookLive(page: ConnectedPage) {
    try {
      return await this.facebook.liveVideos(page);
    } catch (e) {
      if (e instanceof FacebookTokenError) await this.facebook.markInvalid(page.churchId);
      throw e;
    }
  }

  private async closeEnded(tracked: Tracked[], live: Record<string, Set<string> | null>) {
    for (const stream of tracked) {
      const stillLive = live[stream.platform];
      if (!stillLive) continue;
      if (stillLive.has(stream.externalId!)) {
        this.misses.delete(stream.id);
        continue;
      }
      const misses = (this.misses.get(stream.id) ?? 0) + 1;
      if (misses < (MISSES_TO_END[stream.platform] ?? 1)) {
        this.misses.set(stream.id, misses);
        continue;
      }
      this.misses.delete(stream.id);
      const url = stream.platform === StreamPlatform.TWITCH ? await this.twitchRecording(stream) : null;
      await this.prisma.liveStream.updateMany({ where: { id: stream.id, isLive: true }, data: { isLive: false, ...(url && { url }) } });
    }
  }

  /** En Twitch el enlace apunta al canal, que ya no muestra lo que se emitió. */
  private async twitchRecording(stream: Tracked) {
    const login = this.twitch.login(stream.url);
    if (!login) return null;
    return this.twitch.recordingUrl(login, stream.externalId!).catch((e) => {
      this.logger.warn(this.reason(e));
      return null;
    });
  }

  private async start(church: DetectChurch, broadcast: Broadcast) {
    if (church.ignoredLiveIds.includes(broadcast.externalId)) return;
    const separated = separates(church, CampusAspect.STREAMS);
    const started = await this.prisma.$transaction(async (tx) => {
      await takeLiveLock(tx, church.id);
      // Una ya conocida no se reabre: si está apagada es porque terminó o porque alguien la finalizó a mano.
      const known = await tx.liveStream.findUnique({
        where: { churchId_platform_externalId: { churchId: church.id, platform: broadcast.platform, externalId: broadcast.externalId } },
        select: { id: true },
      });
      if (known) return null;

      const planned = await this.findPlanned(tx, church.id, broadcast);
      const campusId = planned?.campusId ?? null;
      const rivals = { churchId: church.id, isLive: true, ...(separated && { campusId }) };
      // Si el canal emite en dos plataformas a la vez, sigue la primera en lugar de alternarlas.
      if (await tx.liveStream.findFirst({ where: { ...rivals, externalId: { not: null } }, select: { id: true } })) return null;
      await tx.liveStream.updateMany({ where: { ...rivals, ...(planned && { id: { not: planned.id } }) }, data: { isLive: false } });

      const data = { externalId: broadcast.externalId, url: broadcast.url, isLive: true, scheduledAt: broadcast.startedAt ?? new Date() };
      const stream = planned
        ? await tx.liveStream.update({ where: { id: planned.id }, data })
        : await tx.liveStream.create({ data: { ...data, churchId: church.id, platform: broadcast.platform, title: broadcast.title } });
      return { stream, alreadyLive: planned?.isLive ?? false };
    });
    if (!started || started.alreadyLive) return;

    const restarted = await this.prisma.liveStream.findFirst({
      where: { churchId: church.id, isLive: false, externalId: { not: null }, updatedAt: { gte: new Date(Date.now() - RESTART_MS) } },
      select: { id: true },
    });
    if (restarted) return;
    await this.push.sendToChurch(church.id, { title: church.name, body: `En vivo ahora: ${started.stream.title}`, url: '/app/en-vivo' }, undefined, separated ? started.stream.campusId : null);
  }

  /** Transmisión agregada a mano que corresponde a esta: conserva su título y su sede, y evita duplicarla. */
  private async findPlanned(tx: Prisma.TransactionClient, churchId: string, broadcast: Broadcast) {
    const now = Date.now();
    const candidates = await tx.liveStream.findMany({
      where: {
        churchId,
        platform: broadcast.platform,
        externalId: null,
        OR: [{ isLive: true }, { scheduledAt: { gte: new Date(now - PLANNED_MS), lte: new Date(now + PLANNED_MS) } }],
      },
      orderBy: { updatedAt: 'desc' },
    });
    return candidates.find((s) => s.url.includes(broadcast.externalId) || sameChannel(s.url, broadcast.channelUrl)) ?? null;
  }

  private reason(e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}
