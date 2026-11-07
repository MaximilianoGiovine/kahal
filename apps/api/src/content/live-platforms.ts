import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIMEOUT_MS = 10_000;
/** Un enlace que no lleva a un canal no se vuelve a consultar hasta pasado este tiempo. */
const UNRESOLVED_MS = 60 * 60_000;
const BATCH = 50;

export interface YouTubeVideo {
  id: string;
  channelId: string;
  title: string;
  state: 'live' | 'upcoming' | 'none';
  startedAt: Date | null;
}

export interface TwitchStream {
  id: string;
  login: string;
  title: string;
  startedAt: Date | null;
}

async function json<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new HttpStatusError(label, res.status);
  return res.json() as Promise<T>;
}

class HttpStatusError extends Error {
  constructor(
    label: string,
    readonly status: number,
  ) {
    super(`${label} respondió ${status}`);
  }
}

/**
 * Buscar en vivo con la API de YouTube cuesta 100 unidades de una cuota de 10.000 diarias.
 * Por eso los videos salen del feed público del canal, que es gratis, y la API solo confirma su estado (1 unidad cada 50).
 */
@Injectable()
export class YouTubeLive {
  private readonly logger = new Logger(YouTubeLive.name);
  private readonly key: string | undefined;
  private readonly channels = new Map<string, { id: string | null; expiresAt: number }>();

  constructor(config: ConfigService) {
    this.key = config.get<string>('YOUTUBE_API_KEY') || undefined;
  }

  get configured() {
    return !!this.key;
  }

  /** Id del canal (UC…) de un enlace con /channel/, /@nombre o /user/. Los enlaces /c/ no se pueden resolver con la API. */
  async channelId(url: string): Promise<string | null> {
    const cached = this.channels.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.id;
    const id = await this.resolveChannel(url);
    this.channels.set(url, { id, expiresAt: id ? Infinity : Date.now() + UNRESOLVED_MS });
    if (!id) this.logger.warn(`No se pudo obtener el canal de YouTube de ${url}`);
    return id;
  }

  private async resolveChannel(url: string): Promise<string | null> {
    let path: string;
    try {
      const u = new URL(url);
      if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
      path = decodeURIComponent(u.pathname);
    } catch {
      return null;
    }
    const direct = path.match(/^\/channel\/(UC[\w-]+)/)?.[1];
    if (direct) return direct;
    const handle = path.match(/^\/@([^/]+)/)?.[1];
    const user = path.match(/^\/user\/([^/]+)/)?.[1];
    if (!handle && !user) return null;
    const query = handle ? `forHandle=${encodeURIComponent(`@${handle}`)}` : `forUsername=${encodeURIComponent(user!)}`;
    const data = await this.api<{ items?: { id: string }[] }>(`channels?part=id&${query}`);
    return data.items?.[0]?.id ?? null;
  }

  async feedVideoIds(channelId: string): Promise<string[]> {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new HttpStatusError('El feed de YouTube', res.status);
    return [...(await res.text()).matchAll(/<yt:videoId>([\w-]+)<\/yt:videoId>/g)].map((m) => m[1]);
  }

  /** Los videos borrados o privados no vuelven en la respuesta. */
  async videos(ids: string[]): Promise<YouTubeVideo[]> {
    const out: YouTubeVideo[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const data = await this.api<{
        items?: { id: string; snippet: { channelId: string; title: string; liveBroadcastContent: YouTubeVideo['state'] }; liveStreamingDetails?: { actualStartTime?: string } }[];
      }>(`videos?part=snippet,liveStreamingDetails&id=${ids.slice(i, i + BATCH).join(',')}`);
      for (const v of data.items ?? []) {
        const started = v.liveStreamingDetails?.actualStartTime;
        out.push({ id: v.id, channelId: v.snippet.channelId, title: v.snippet.title, state: v.snippet.liveBroadcastContent, startedAt: started ? new Date(started) : null });
      }
    }
    return out;
  }

  /** La clave va en un encabezado para que no aparezca en ninguna URL registrada. */
  private api<T>(path: string) {
    return json<T>(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { 'X-Goog-Api-Key': this.key! } }, 'La API de YouTube');
  }
}

@Injectable()
export class TwitchLive {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('TWITCH_CLIENT_ID') || undefined;
    this.clientSecret = config.get<string>('TWITCH_CLIENT_SECRET') || undefined;
  }

  get configured() {
    return !!this.clientId && !!this.clientSecret;
  }

  /** Nombre del canal en un enlace twitch.tv/canal. */
  login(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname.replace(/^www\.|^m\./, '') !== 'twitch.tv') return null;
      return u.pathname.match(/^\/(\w+)\/?$/)?.[1]?.toLowerCase() ?? null;
    } catch {
      return null;
    }
  }

  async streams(logins: string[]): Promise<TwitchStream[]> {
    const out: TwitchStream[] = [];
    for (let i = 0; i < logins.length; i += 100) {
      const query = logins.slice(i, i + 100).map((l) => `user_login=${encodeURIComponent(l)}`).join('&');
      const data = await this.api<{ data: { id: string; user_login: string; title: string; started_at?: string; type: string }[] }>(`streams?type=live&first=100&${query}`);
      for (const s of data.data) {
        if (s.type === 'live') out.push({ id: s.id, login: s.user_login.toLowerCase(), title: s.title, startedAt: s.started_at ? new Date(s.started_at) : null });
      }
    }
    return out;
  }

  /** Grabación de una transmisión, si el canal guarda sus videos. */
  async recordingUrl(login: string, streamId: string): Promise<string | null> {
    const users = await this.api<{ data: { id: string }[] }>(`users?login=${encodeURIComponent(login)}`);
    if (!users.data[0]) return null;
    const videos = await this.api<{ data: { url: string; stream_id: string | null }[] }>(`videos?type=archive&first=20&user_id=${users.data[0].id}`);
    return videos.data.find((v) => v.stream_id === streamId)?.url ?? null;
  }

  private async api<T>(path: string, retry = true): Promise<T> {
    try {
      const token = await this.accessToken();
      return await json<T>(`https://api.twitch.tv/helix/${path}`, { headers: { 'Client-Id': this.clientId!, Authorization: `Bearer ${token}` } }, 'La API de Twitch');
    } catch (e) {
      if (!retry || !(e instanceof HttpStatusError) || e.status !== 401) throw e;
      this.token = null;
      return this.api<T>(path, false);
    }
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const body = new URLSearchParams({ client_id: this.clientId!, client_secret: this.clientSecret!, grant_type: 'client_credentials' });
    const data = await json<{ access_token: string; expires_in: number }>('https://id.twitch.tv/oauth2/token', { method: 'POST', body }, 'El acceso a Twitch');
    this.token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return this.token.value;
  }
}
