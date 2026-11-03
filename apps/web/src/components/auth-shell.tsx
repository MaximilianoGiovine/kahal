import type { ReactNode } from 'react';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <div className="flex w-full max-w-md items-center justify-between">
        <Brand />
        <ThemeToggle />
      </div>
      <div className="glass mt-10 w-full max-w-md rounded-3xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
    </div>
  );
}
