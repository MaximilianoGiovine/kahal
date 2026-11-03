import clsx from 'clsx';
import Link from 'next/link';

export function BrandIcon({ className }: { className?: string }) {
  return (
    <span className={clsx('bg-accent-gradient inline-flex items-center justify-center rounded-xl text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_20px_-6px_var(--accent)]', className ?? 'size-8')}>
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2v5M9.5 4.5h5" />
        <path d="M4 21V12l8-5 8 5v9" />
        <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
        <path d="M2 21h20" />
      </svg>
    </span>
  );
}

export function Brand({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={clsx('inline-flex items-center gap-2.5', className)}>
      <BrandIcon />
      <span className="font-display text-xl font-semibold tracking-tight uppercase">Kahal</span>
    </Link>
  );
}
