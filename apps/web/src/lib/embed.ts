/** Convierte un link de YouTube/Facebook en una URL embebible. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
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
    if (host === 'facebook.com' || host === 'fb.watch') {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
    }
    return null;
  } catch {
    return null;
  }
}
