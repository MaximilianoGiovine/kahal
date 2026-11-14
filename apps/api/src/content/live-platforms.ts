import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIMEOUT_MS = 10_000;
/** Un enlace que no lleva a un canal no se vuelve a consultar hasta pasado este tiempo. */
const UNRESOLVED_MS = 60 * 60_000;
const BATCH = 50;
/** La página /live se lee hasta el enlace canónico (a unos 800 KB del inicio, a veces dentro del body); más allá se corta. */
const LIVE_PAGE_MAX_BYTES = 3 * 1024 * 1024;
const CANONICAL = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/([^"]*)"/;
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'es-419,es;q=0.9',
  // Sin esto, desde un servidor en Europa YouTube redirige a la pantalla de consentimiento de cookies.
  Cookie: 'SOCS=CAI; CONSENT=YES+',
};

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
 * Por eso los videos salen de fuentes públicas y gratuitas, y la API solo confirma su estado (1 unidad cada 50):
 * - la página /live del canal, que apunta a la transmisión en curso (o a la próxima programada) en cuanto empieza;
 * - el feed RSS, que tarda en incluir una transmisión recién iniciada y queda como respaldo.
 */
@Injectable()
export class YouTubeLive {
  private readonly logger = new Logger(YouTubeLive.name);
  private readonly key: string | undefined;
  private readonly channels = new Map<string, { id: string | null; expiresAt: number }>();
  private readonly lives = new Map<string, { id: string | null; expiresAt: number }>();

  constructor(config: ConfigService) {
    this.key = config.get<string>('YOUTUBE_API_KEY') || undefined;
  }

  get configured() {
    return !!this.key;
  }

  /** Enlace a un canal (no a un video): /@nombre, /channel/, /user/ o /c/, con o sin /live al final. */
  static isChannelUrl(url: string) {
    try {
      const u = new URL(url);
      return /(^|\.)youtube\.com$/.test(u.hostname) && !u.searchParams.has('v') && /^\/(@|channel\/|user\/|c\/)/.test(u.pathname);
    } catch {
      return false;
    }
  }

  /**
   * Video que se reproduce para un enlace de canal: la transmisión en curso o la próxima programada.
   * No usa la cuota de la API y se guarda un minuto, porque la página En vivo se consulta seguido.
   */
  async currentVideoOf(url: string): Promise<{ videoId: string | null; channelId: string | null }> {
    const channelId = await this.channelId(url).catch((e) => {
      this.logger.warn(e instanceof Error ? e.message : String(e));
      return null;
    });
    if (!channelId) return { videoId: null, channelId: null };
    const cached = this.lives.get(channelId);
    if (cached && cached.expiresAt > Date.now()) return { videoId: cached.id, channelId };
    const videoId = await this.liveVideoId(channelId).catch((e) => {
      this.logger.warn(e instanceof Error ? e.message : String(e));
      return null;
    });
    this.lives.set(channelId, { id: videoId, expiresAt: Date.now() + 60_000 });
    return { videoId, channelId };
  }

  /** Id del canal (UC…) de un enlace con /channel/, /@nombre, /user/ o /c/. Sin clave de API se lee de la página del canal. */
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
    const custom = path.match(/^\/c\/([^/]+)/)?.[1];
    if ((handle || user) && this.key) {
      const query = handle ? `forHandle=${encodeURIComponent(`@${handle}`)}` : `forUsername=${encodeURIComponent(user!)}`;
      const data = await this.api<{ items?: { id: string }[] }>(`channels?part=id&${query}`);
      if (data.items?.[0]?.id) return data.items[0].id;
    }
    if (!handle && !user && !custom) return null;
    // La API no resuelve los enlaces /c/ (ni algunos @nombre recientes): la página del canal sí dice su id.
    const segment = handle ? `@${handle}` : user ? `user/${user}` : `c/${custom}`;
    const canonical = await this.canonicalPath(`https://www.youtube.com/${encodeURI(segment)}`);
    return canonical.match(/^channel\/(UC[\w-]+)/)?.[1] ?? null;
  }

  async feedVideoIds(channelId: string): Promise<string[]> {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new HttpStatusError('El feed de YouTube', res.status);
    return [...(await res.text()).matchAll(/<yt:videoId>([\w-]+)<\/yt:videoId>/g)].map((m) => m[1]);
  }

  /** Video al que apunta la página /live del canal: el que está en vivo o el próximo programado. Null si no hay ninguno. */
  async liveVideoId(channelId: string): Promise<string | null> {
    const path = await this.canonicalPath(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`);
    return path.match(/^watch\?v=([\w-]{11})/)?.[1] ?? null;
  }

  /** Ruta del enlace canónico de una página de YouTube (sin el dominio). */
  private async canonicalPath(url: string): Promise<string> {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok || !res.body) throw new HttpStatusError('La página de YouTube', res.status);
    const host = new URL(res.url).hostname;
    if (host !== 'www.youtube.com') {
      await res.body.cancel().catch(() => undefined);
      throw new Error(`YouTube redirigió ${url} a ${host}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    try {
      while (html.length < LIVE_PAGE_MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        const canonical = CANONICAL.exec(html);
        if (canonical) return canonical[1];
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    // Sin enlace canónico la página no es la esperada (verificación anti-bots, cambio de formato): no se sabe.
    throw new Error(`La página ${url} de YouTube no tiene el formato esperado`);
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

export interface FacebookPageAccess {
  id: string;
  name: string;
  link: string | null;
  token: string;
}

export interface FacebookLiveVideo {
  id: string;
  videoId: string | null;
  title: string;
  startedAt: Date | null;
}

/** Facebook rechazó el token de la página: la iglesia tiene que volver a conectarla. */
export class FacebookTokenError extends Error {}

const FACEBOOK_SCOPES = 'pages_show_list,pages_read_engagement';

/**
 * Facebook no deja leer páginas ajenas: un administrador de la página la conecta una vez con su cuenta
 * y Kahal guarda el token de la página, que no vence mientras esa persona siga administrándola.
 */
@Injectable()
export class FacebookLive {
  private readonly appId: string | undefined;
  private readonly appSecret: string | undefined;
  private readonly version: string;

  constructor(config: ConfigService) {
    this.appId = config.get<string>('FACEBOOK_APP_ID') || undefined;
    this.appSecret = config.get<string>('FACEBOOK_APP_SECRET') || undefined;
    this.version = config.get<string>('FACEBOOK_GRAPH_VERSION') || 'v23.0';
  }

  get configured() {
    return !!this.appId && !!this.appSecret;
  }

  authorizeUrl(callbackUrl: string, state: string) {
    const params = new URLSearchParams({ client_id: this.appId!, redirect_uri: callbackUrl, state, response_type: 'code', scope: FACEBOOK_SCOPES });
    return `https://www.facebook.com/${this.version}/dialog/oauth?${params}`;
  }

  /** Páginas que administra quien autorizó, con tokens que no vencen (salen de un token de usuario de larga duración). */
  async pages(code: string, callbackUrl: string): Promise<FacebookPageAccess[]> {
    const short = await this.graph<{ access_token: string }>('oauth/access_token', { client_id: this.appId!, client_secret: this.appSecret!, redirect_uri: callbackUrl, code });
    const long = await this.graph<{ access_token: string }>('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: this.appId!,
      client_secret: this.appSecret!,
      fb_exchange_token: short.access_token,
    });
    const out: FacebookPageAccess[] = [];
    let after: string | undefined;
    do {
      const page = await this.graph<{ data: { id: string; name: string; link?: string; access_token?: string }[]; paging?: { cursors?: { after?: string }; next?: string } }>(
        'me/accounts',
        { fields: 'id,name,link,access_token', limit: '100', access_token: long.access_token, ...(after && { after }) },
      );
      for (const p of page.data) if (p.access_token) out.push({ id: p.id, name: p.name, link: p.link ?? null, token: p.access_token });
      after = page.paging?.next ? page.paging.cursors?.after : undefined;
    } while (after);
    return out;
  }

  async liveVideos(pageId: string, token: string): Promise<FacebookLiveVideo[]> {
    const data = await this.graph<{ data: { id: string; title?: string; status: string; creation_time?: string; video?: { id: string } }[] }>(
      `${encodeURIComponent(pageId)}/live_videos`,
      { broadcast_status: '["LIVE"]', fields: 'id,title,status,creation_time,video{id}', limit: '10', access_token: token },
    );
    return data.data
      .filter((v) => v.status === 'LIVE')
      .map((v) => ({ id: v.id, videoId: v.video?.id ?? null, title: v.title ?? '', startedAt: v.creation_time ? new Date(v.creation_time) : null }));
  }

  /** Los tokens van en la query (así lo pide Graph API): por eso los errores no incluyen la URL. */
  private async graph<T>(path: string, params: Record<string, string>): Promise<T> {
    const res = await fetch(`https://graph.facebook.com/${this.version}/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return res.json() as Promise<T>;
    const body = (await res.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
    // 190: token inválido o vencido. 10 y 200-299: se quitó el permiso o la persona ya no administra la página.
    const code = body?.error?.code;
    if (code === 190 || code === 10 || (code !== undefined && code >= 200 && code < 300)) throw new FacebookTokenError(`Facebook rechazó el token (${code}): ${body?.error?.message ?? ''}`);
    throw new HttpStatusError('La API de Facebook', res.status);
  }
}
