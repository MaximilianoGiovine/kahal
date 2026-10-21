import type { ReactNode } from 'react';
import { Brand } from './brand';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Brand />
      <div className="mt-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
    </div>
  );
}
