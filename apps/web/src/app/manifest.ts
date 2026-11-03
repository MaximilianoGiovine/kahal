import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kahal',
    short_name: 'Kahal',
    description: 'Tu iglesia en tu bolsillo: novedades, transmisiones en vivo y citas.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#1a1c22',
    theme_color: '#1a1c22',
    lang: 'es',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
