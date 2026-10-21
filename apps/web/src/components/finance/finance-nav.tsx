'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';

export function FinanceNav() {
  const pathname = usePathname();
  const { me } = useSession();
  const items = [
    { href: '/app/finanzas', label: 'Resumen' },
    { href: '/app/finanzas/movimientos', label: 'Movimientos' },
    ...(can.financeWrite(me.role) ? [{ href: '/app/finanzas/configuracion', label: 'Cuentas y categorías' }] : []),
  ];
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={clsx(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
            pathname === i.href ? 'border-accent text-accent-ink' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
