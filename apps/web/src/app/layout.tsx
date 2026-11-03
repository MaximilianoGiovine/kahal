import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import { Providers } from '@/components/providers';
import { THEME_SCRIPT } from '@/components/theme-toggle';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], variable: '--font-poppins', display: 'swap', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'Kahal', template: '%s · Kahal' },
  description: 'Gestión de iglesias: finanzas, membresía, novedades, transmisiones y citas pastorales.',
  applicationName: 'Kahal',
  appleWebApp: { capable: true, title: 'Kahal', statusBarStyle: 'black' },
};

export const viewport: Viewport = {
  themeColor: '#1a1c22',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" className={`${inter.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
