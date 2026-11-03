'use client';

import clsx from 'clsx';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Menú de acciones "⋯" que se cierra al elegir o al hacer click afuera. */
export function ActionMenu({ items, label = 'Acciones' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
        aria-label={label}
        aria-expanded={open}
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open && (
        <div role="menu" className="glass-strong absolute right-0 z-20 mt-1 min-w-44 rounded-xl p-1">
          {visible.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onClick();
              }}
              className={clsx(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap',
                it.danger ? 'text-danger hover:bg-danger-soft' : 'hover:bg-surface-3',
              )}
            >
              {it.icon && <it.icon className="size-4" />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
