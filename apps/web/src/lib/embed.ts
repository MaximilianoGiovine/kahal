/** Canales de transmisión que cada iglesia puede configurar. */
export const STREAM_CHANNELS = [
  { key: 'youtubeUrl', label: 'YouTube', placeholder: 'https://www.youtube.com/@mi-iglesia' },
  { key: 'facebookUrl', label: 'Facebook', placeholder: 'https://www.facebook.com/mi-iglesia' },
  { key: 'twitchUrl', label: 'Twitch', placeholder: 'https://www.twitch.tv/mi-iglesia' },
] as const;

export type StreamChannels = Partial<Record<(typeof STREAM_CHANNELS)[number]['key'], string | null>>;

export const PLATFORM_LABEL = { YOUTUBE: 'YouTube', FACEBOOK: 'Facebook', TWITCH: 'Twitch', OTHER: 'Otro' } as const;

/**
 * URL embebible de una transmisión. Para un enlace de canal de YouTube la API indica el video
 * que se emite ahora; si no lo encontró, se usa el reproductor de la transmisión en vivo del canal.
 */
export function streamEmbedUrl(stream: { url: string; youtubeVideoId?: string | null; youtubeChannelId?: string | null }): string | null {
  if (stream.youtubeVideoId) return `https://www.youtube-nocookie.com/embed/${stream.youtubeVideoId}?autoplay=1&rel=0`;
  if (stream.youtubeChannelId) return `https://www.youtube-nocookie.com/embed/live_stream?channel=${stream.youtubeChannelId}&autoplay=1`;
  return embedUrl(stream.url);
}

/** Convierte un link de YouTube, Facebook o Twitch en una URL embebible. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\.|^web\./, '');
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?autoplay=1&rel=0`;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const id =
        u.searchParams.get('v') ??
        u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]+)/)?.[1];
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      const channel = u.pathname.match(/^\/channel\/([\w-]+)/)?.[1];
      if (channel) return `https://www.youtube-nocookie.com/embed/live_stream?channel=${channel}&autoplay=1`;
      return null;
    }
    if (host === 'facebook.com' || host === 'fb.watch' || host === 'fb.com') return facebookEmbed(u);
    if (host === 'twitch.tv' || host === 'player.twitch.tv') return twitchEmbed(u);
    return null;
  } catch {
    return null;
  }
}

/** Id del video en los formatos de enlace de Facebook que el reproductor embebido acepta. */
function facebookVideo(u: URL): { page: string; id: string } | null {
  const path = u.pathname;
  const inPage = path.match(/^\/([\w.-]+)\/videos\/(?:[^/]+\/)?(\d+)/);
  if (inPage) return { page: inPage[1], id: inPage[2] };
  const id =
    path.match(/^\/(?:reel|videos)\/(\d+)/)?.[1] ??
    (/^\/(?:watch(?:\/live)?\/?|video\.php)$/.test(path) ? u.searchParams.get('v') : null);
  return id && /^\d+$/.test(id) ? { page: 'facebook', id } : null;
}

/**
 * Facebook solo embebe videos concretos y públicos, con su enlace completo (…/videos/123).
 * Los enlaces de página, los cortos (fb.watch) y los de "Compartir" (/share/…) no se reproducen
 * embebidos: para esos devolvemos null y se ofrece abrirlos en Facebook.
 */
function facebookEmbed(u: URL): string | null {
  const video = facebookVideo(u);
  if (!video) return null;
  const href = `https://www.facebook.com/${video.page}/videos/${video.id}/`;
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&autoplay=true&width=1280&height=720`;
}

/** Indica si un enlace de Facebook no se va a poder reproducir dentro de Kahal. */
export function isUnplayableFacebook(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\.|^web\./, '');
    return (host === 'facebook.com' || host === 'fb.watch' || host === 'fb.com') && !facebookVideo(u);
  } catch {
    return false;
  }
}

/**
 * Twitch exige indicar el dominio que embebe (parent) y solo funciona sobre HTTPS.
 * Soporta canales (en vivo: twitch.tv/canal), videos (twitch.tv/videos/123) y el player directo.
 */
function twitchEmbed(u: URL): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams({ parent: window.location.hostname, autoplay: 'true' });
  if (u.hostname === 'player.twitch.tv') {
    const channel = u.searchParams.get('channel');
    const video = u.searchParams.get('video');
    if (channel) params.set('channel', channel);
    else if (video) params.set('video', video);
    else return null;
  } else {
    const video = u.pathname.match(/^\/videos\/(\d+)/)?.[1];
    const channel = u.pathname.match(/^\/([\w]+)\/?$/)?.[1];
    if (video) params.set('video', video);
    else if (channel) params.set('channel', channel);
    else return null;
  }
  return `https://player.twitch.tv/?${params}`;
}
