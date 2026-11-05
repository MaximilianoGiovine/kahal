'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  HandCoins,
  History,
  Home,
  LogOut,
  Megaphone,
  Menu,
  MonitorPlay,
  Settings,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { churchRequestsQuery } from '@/lib/church-requests';
import { fullName, roleNames } from '@/lib/format';
import { can } from '@/lib/permissions';
import { SessionProvider, useMe, useSession } from '@/lib/session';
import type { Me } from '@/lib/types';
import { BrandIcon } from './brand';
import { ThemeToggle } from './theme-toggle';
import { Avatar, Card, ErrorState, Loading, Select } from './ui';

interface NavItem {
  badge?: number;
  href: string;
  label: string;
  icon: LucideIcon;
  show?: (me: Me) => boolean;
  mobile?: boolean;
}

const MAIN: NavItem[] = [
  { href: '/app', label: 'Inicio', icon: Home, mobile: true },
  { href: '/app/novedades', label: 'Novedades', icon: Megaphone, mobile: true },
  { href: '/app/eventos', label: 'Agenda', icon: CalendarDays },
  { href: '/app/articulos', label: 'Artículos', icon: BookOpen },
  { href: '/app/en-vivo', label: 'En vivo', icon: MonitorPlay, mobile: true },
  { href: '/app/citas', label: 'Citas', icon: CalendarClock, mobile: true },
];

const ADMIN: NavItem[] = [
  { href: '/app/miembros', label: 'Miembros', icon: Users, show: can.people },
  { href: '/app/finanzas', label: 'Finanzas', icon: HandCoins, show: can.financeRead },
  { href: '/app/actividad', label: 'Registro', icon: History, show: can.activity },
  { href: '/app/configuracion', label: 'Configuración', icon: Settings, show: can.settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error, refetch } = useMe();
  const unauthorized = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    // Recarga completa con "expired": el middleware no rebota a /app y no queda el error en caché.
    if (unauthorized) window.location.replace(`/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`);
  }, [unauthorized]);

  if (error && !unauthorized) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loading />
      </div>
    );
  }
  return (
    <SessionProvider me={me}>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}

function isActive(pathname: string, href: string) {
  return href === '/app' ? pathname === '/app' : pathname === href || pathname.startsWith(`${href}/`);
}

function Shell({ children }: { children: ReactNode }) {
  const { me, church, isSuperAdmin } = useSession();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);

  const needsChurch = isSuperAdmin && !church && !pathname.startsWith('/app/admin') && pathname !== '/app/perfil';

  return (
    <div className="min-h-dvh lg:pl-[17.5rem]">
      {/* Sidebar escritorio: panel de vidrio flotante */}
      <aside className="glass fixed inset-y-4 left-4 z-30 hidden w-64 flex-col rounded-3xl lg:flex">
        <Sidebar />
      </aside>

      {/* Drawer móvil */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="glass-strong absolute inset-y-2 left-2 flex w-72 max-w-[85vw] flex-col rounded-3xl">
            <button className="absolute top-5 right-3 rounded-lg p-1.5 text-muted hover:bg-surface-2" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Barra superior móvil */}
      <header className="glass sticky top-2 z-20 mx-2 mt-2 flex h-16 items-center gap-3 rounded-2xl px-3 lg:hidden">
        <button onClick={() => setDrawer(true)} className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted hover:text-fg" aria-label="Abrir menú">
          <Menu className="size-[18px]" />
        </button>
        <span className="font-display truncate font-semibold">{church?.name ?? 'Kahal'}</span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/app/perfil" aria-label="Mi perfil">
            <RingAvatar me={me} size={36} />
          </Link>
        </div>
      </header>

      {/* Barra superior escritorio */}
      <header className="glass sticky top-4 z-20 mt-4 mr-4 hidden h-[72px] items-center gap-4 rounded-3xl px-6 lg:flex">
        <div className="min-w-0">
          <p className="text-xs text-subtle">{isSuperAdmin ? 'Operando sobre' : 'Tu iglesia'}</p>
          <p className="font-display truncate text-sm font-medium">{church?.name ?? 'Ninguna iglesia elegida'}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <span className="h-8 w-px bg-border" aria-hidden />
          <Link href="/app/perfil" className="flex items-center gap-3 rounded-xl py-1 pr-1 pl-3 transition hover:bg-surface-2">
            <span className="text-right">
              <span className="font-display block text-sm leading-tight font-medium">{fullName(me)}</span>
              <span className="block max-w-48 truncate text-xs text-muted">{roleNames(me)}</span>
            </span>
            <RingAvatar me={me} size={40} />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{needsChurch ? <ChurchPicker /> : children}</main>

      {/* Navegación inferior móvil */}
      <nav className="glass-strong fixed inset-x-3 bottom-3 z-20 mb-[env(safe-area-inset-bottom)] grid grid-cols-4 rounded-2xl p-1.5 lg:hidden">
        {MAIN.filter((i) => i.mobile).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx('flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition', active ? 'bg-surface-3 text-fg' : 'text-muted')}
            >
              <item.icon className={clsx('size-5', active && 'text-accent-ink drop-shadow-[0_0_6px_var(--accent)]')} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Avatar con anillo en degradé, como el del encabezado. */
function RingAvatar({ me, size }: { me: Me; size: number }) {
  return (
    <span className="bg-accent-gradient inline-flex shrink-0 rounded-full p-[2px]">
      <span className="rounded-full bg-surface-solid p-[2px]">
        <Avatar name={me} size={size - 8} />
      </span>
    </span>
  );
}

function Sidebar() {
  const { me, church, isSuperAdmin, churches, selectChurch } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    router.replace('/login');
  }

  const admin = ADMIN.filter((i) => !i.show || i.show(me));
  const { data: requests } = useQuery({ ...churchRequestsQuery, enabled: isSuperAdmin });
  const pendingRequests = requests?.filter((r) => r.status === 'PENDING').length ?? 0;

  const link = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={clsx(
          'font-display relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors',
          active ? 'bg-surface-3 font-medium text-fg shadow-[inset_0_1px_0_var(--glass-highlight)]' : 'text-muted hover:bg-surface-2 hover:text-fg',
        )}
      >
        {active && <span className="bg-accent-gradient absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full shadow-glow" aria-hidden />}
        <item.icon className={clsx('size-[18px]', active && 'text-accent-ink drop-shadow-[0_0_6px_var(--accent)]')} />
        <span className="flex-1">{item.label}</span>
        {!!item.badge && (
          <span className="bg-accent-gradient rounded-full px-1.5 text-xs font-semibold text-accent-fg tabular" aria-label={`${item.badge} pendientes`}>
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <div className="flex items-center gap-3 px-6 pt-6 pb-8">
        <BrandIcon className="size-10" />
        <div className="min-w-0">
          <p className="font-display text-lg leading-none font-semibold tracking-wide uppercase">Kahal</p>
          <p className="mt-1 truncate text-xs text-muted">{church?.name ?? 'Gestión de iglesias'}</p>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="px-4 pb-4">
          <Select value={church?.id ?? ''} onChange={(e) => selectChurch(e.target.value || null)} aria-label="Iglesia activa" className="h-9">
            <option value="">— Elegir iglesia —</option>
            {churches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {church && MAIN.map(link)}
        {church && admin.length > 0 && (
          <>
            <p className="px-3.5 pt-6 pb-2 text-[11px] font-medium tracking-wider text-subtle uppercase">Administración</p>
            {admin.map(link)}
          </>
        )}
        {isSuperAdmin && (
          <>
            <p className="px-3.5 pt-6 pb-2 text-[11px] font-medium tracking-wider text-subtle uppercase">Plataforma</p>
            {link({ href: '/app/admin', label: 'Iglesias', icon: Building2, badge: pendingRequests })}
          </>
        )}
      </nav>

      <div className="space-y-1 px-3 py-4">
        {link({ href: '/app/perfil', label: 'Mi perfil', icon: UserRound })}
        <button onClick={logout} className="font-display flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg">
          <LogOut className="size-[18px]" /> Cerrar sesión
        </button>
      </div>
    </>
  );
}

function ChurchPicker() {
  const { churches, selectChurch } = useSession();
  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="font-display text-2xl font-bold">Elegí una iglesia</h1>
      <p className="mt-1 text-sm text-muted">Como super admin podés operar sobre cualquier iglesia de la plataforma.</p>
      <div className="mt-6 grid gap-3">
        {churches.map((c) => (
          <Card key={c.id} className="cursor-pointer p-4 transition hover:border-accent/50" onClick={() => selectChurch(c.id)}>
            <p className="font-medium">{c.name}</p>
            <p className="text-sm text-muted">
              {c.city ?? '—'} · {c.active ? 'Activa' : 'Deshabilitada'}
            </p>
          </Card>
        ))}
        <Link href="/app/admin" className="text-sm font-medium text-accent-ink hover:underline">
          Administrar iglesias →
        </Link>
      </div>
    </div>
  );
}
