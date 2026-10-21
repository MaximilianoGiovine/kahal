'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Building2,
  CalendarClock,
  CalendarDays,
  HandCoins,
  Home,
  LogOut,
  Megaphone,
  Menu,
  MonitorPlay,
  Settings,
  UserCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { fullName, ROLE_LABEL } from '@/lib/format';
import { can } from '@/lib/permissions';
import { SessionProvider, useMe, useSession } from '@/lib/session';
import type { Role } from '@/lib/types';
import { BrandIcon } from './brand';
import { Avatar, Card, Loading, Select } from './ui';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  show?: (r: Role) => boolean;
  badge?: 'pending';
  mobile?: boolean;
}

const MAIN: NavItem[] = [
  { href: '/app', label: 'Inicio', icon: Home, mobile: true },
  { href: '/app/novedades', label: 'Novedades', icon: Megaphone, mobile: true },
  { href: '/app/eventos', label: 'Agenda', icon: CalendarDays },
  { href: '/app/en-vivo', label: 'En vivo', icon: MonitorPlay, mobile: true },
  { href: '/app/citas', label: 'Citas', icon: CalendarClock, mobile: true },
];

const ADMIN: NavItem[] = [
  { href: '/app/miembros', label: 'Miembros', icon: Users, show: can.people },
  { href: '/app/solicitudes', label: 'Solicitudes', icon: UserCheck, show: can.approve, badge: 'pending' },
  { href: '/app/finanzas', label: 'Finanzas', icon: HandCoins, show: can.financeRead },
  { href: '/app/configuracion', label: 'Configuración', icon: Settings, show: can.settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (error) router.replace('/login');
  }, [error, router]);

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
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <Sidebar />
      </aside>

      {/* Drawer móvil */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <button className="absolute top-4 right-3 rounded-md p-1.5 text-muted hover:bg-surface-2" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setDrawer(true)} className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Abrir menú">
          <Menu className="size-5" />
        </button>
        <span className="truncate font-semibold">{church?.name ?? 'Kahal'}</span>
        <Link href="/app/perfil" className="ml-auto" aria-label="Mi perfil">
          <Avatar name={me} size={30} />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{needsChurch ? <ChurchPicker /> : children}</main>

      {/* Navegación inferior móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MAIN.filter((i) => i.mobile).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive(pathname, item.href) ? 'text-accent-ink' : 'text-muted')}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Sidebar() {
  const { me, church, isSuperAdmin, churches, selectChurch } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: pending } = useQuery({
    queryKey: ['users', 'pending-count'],
    queryFn: () => api<{ count: number }>('/users/pending-count'),
    enabled: !!church && can.approve(me.role),
    refetchInterval: 60_000,
  });

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    router.replace('/login');
  }

  const admin = ADMIN.filter((i) => !i.show || i.show(me.role));

  const link = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      className={clsx(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive(pathname, item.href) ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <item.icon className="size-[18px]" />
      <span className="flex-1">{item.label}</span>
      {item.badge === 'pending' && !!pending?.count && (
        <span className="tabular rounded-full bg-accent px-1.5 py-0.5 text-[11px] leading-none font-semibold text-accent-fg">{pending.count}</span>
      )}
    </Link>
  );

  return (
    <>
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <BrandIcon className="size-9" />
        <div className="min-w-0">
          <p className="font-display truncate text-[15px] leading-tight font-semibold">{church?.name ?? 'Kahal'}</p>
          <p className="text-xs text-muted">Kahal</p>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="px-4 pb-3">
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

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {church && MAIN.map(link)}
        {church && admin.length > 0 && (
          <>
            <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-subtle uppercase">Administración</p>
            {admin.map(link)}
          </>
        )}
        {isSuperAdmin && (
          <>
            <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-subtle uppercase">Plataforma</p>
            {link({ href: '/app/admin', label: 'Iglesias', icon: Building2 })}
          </>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <Link href="/app/perfil" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
          <Avatar name={me} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{fullName(me)}</p>
            <p className="truncate text-xs text-muted">{ROLE_LABEL[me.role]}</p>
          </div>
          <UserRound className="size-4 text-subtle" />
        </Link>
        <button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
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
      <h1 className="font-display text-2xl font-semibold">Elegí una iglesia</h1>
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
