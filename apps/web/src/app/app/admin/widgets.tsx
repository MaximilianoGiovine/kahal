import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Bloque con título dentro de una tarjeta de listas. */
export function Section({ icon, title, href, children }: { icon: ReactNode; title: string; href?: string; children: ReactNode }) {
  return (
    <section className="p-3">
      <div className="mb-1 flex items-center gap-2 px-2 text-xs font-medium tracking-wide text-muted uppercase">
        {icon}
        <span className="flex-1">{title}</span>
        {href && (
          <Link href={href} className="text-accent-ink normal-case hover:underline" aria-label={`Ver ${title}`}>
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Fila de lista: enlazada cuando hay adónde ir. */
export function Row({ href, title, subtitle, meta }: { href?: string; title: string; subtitle?: string; meta?: ReactNode }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {meta && <div className="shrink-0 text-xs text-muted">{meta}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-2 py-2">{body}</div>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
      {children} <ArrowRight className="size-3.5" />
    </Link>
  );
}

