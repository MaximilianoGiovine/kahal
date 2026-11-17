import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIMEOUT_MS = 10_000;
const SCOPES = 'instagram_business_basic';

export type InstagramMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';

export interface InstagramPost {
  id: string;
  type: InstagramMediaType;
  caption: string | null;
  /** Imagen o, en un video, su portada. En un carrusel, la primera. */
  imageUrl: string | null;
  /** Solo en videos (incluidos los reels). */
  videoUrl: string | null;
  permalink: string;
  timestamp: string;
}

/** Instagram rechazó el token: venció o se quitó el permiso. Hay que volver a conectar la cuenta. */
export class InstagramTokenError extends Error {}

interface RawMedia {
  id: string;
  media_type: InstagramMediaType;
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  permalink: string;
  timestamp: string;
}

/**
 * API de Instagram con inicio de sesión de Instagram (cuentas profesionales: empresa o creador).
 * Apagada sin INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET.
 */
@Injectable()
export class InstagramClient {
  private readonly appId: string | undefined;
  private readonly appSecret: string | undefined;

  constructor(config: ConfigService) {
    this.appId = config.get<string>('INSTAGRAM_APP_ID') || undefined;
    this.appSecret = config.get<string>('INSTAGRAM_APP_SECRET') || undefined;
  }

  get configured() {
    return !!this.appId && !!this.appSecret;
  }

  authorizeUrl(callbackUrl: string, state: string) {
    const params = new URLSearchParams({ client_id: this.appId!, redirect_uri: callbackUrl, response_type: 'code', scope: SCOPES, state });
    return `https://www.instagram.com/oauth/authorize?${params}`;
  }

  /** Canjea el código por un token de 60 días y devuelve la cuenta que autorizó. */
  async connect(code: string, callbackUrl: string) {
    // Instagram agrega "#_" al final del código en la redirección.
    const clean = code.replace(/#_$/, '');
    const res = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: new URLSearchParams({ client_id: this.appId!, client_secret: this.appSecret!, grant_type: 'authorization_code', redirect_uri: callbackUrl, code: clean }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Instagram no aceptó el código (${res.status})`);
    const short = (await res.json()) as { access_token: string };
    const long = await this.get<{ access_token: string; expires_in: number }>('access_token', { grant_type: 'ig_exchange_token', client_secret: this.appSecret!, access_token: short.access_token });
    const me = await this.get<{ user_id?: string; id: string; username: string }>('me', { fields: 'user_id,username', access_token: long.access_token });
    return { igUserId: me.user_id ?? me.id, username: me.username, token: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000) };
  }

  /** Renueva un token de larga duración por otros 60 días. Debe tener al menos 24 horas. */
  async refresh(token: string) {
    const data = await this.get<{ access_token: string; expires_in: number }>('refresh_access_token', { grant_type: 'ig_refresh_token', access_token: token });
    return { token: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000) };
  }

  async recentMedia(token: string, limit: number): Promise<InstagramPost[]> {
    const data = await this.get<{ data: RawMedia[] }>('me/media', {
      fields: 'id,media_type,media_url,thumbnail_url,caption,permalink,timestamp',
      limit: String(limit),
      access_token: token,
    });
    return data.data.map((m) => ({
      id: m.id,
      type: m.media_type,
      caption: m.caption ?? null,
      imageUrl: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) ?? null,
      videoUrl: m.media_type === 'VIDEO' ? (m.media_url ?? null) : null,
      permalink: m.permalink,
      timestamp: m.timestamp,
    }));
  }

  /** Los tokens van en la query: por eso los errores no incluyen la URL. */
  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const res = await fetch(`https://graph.instagram.com/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) return res.json() as Promise<T>;
    const body = (await res.json().catch(() => null)) as { error?: { code?: number; type?: string; message?: string } } | null;
    const code = body?.error?.code;
    // 190: token inválido o vencido. 10 y 200-299: se quitó el permiso. Los límites de uso (4, 17, 32) no invalidan nada.
    if (code === 190 || code === 10 || (code !== undefined && code >= 200 && code < 300)) throw new InstagramTokenError(`Instagram rechazó el token (${code ?? res.status}): ${body?.error?.message ?? ''}`);
    throw new Error(`La API de Instagram respondió ${res.status}`);
  }
}
