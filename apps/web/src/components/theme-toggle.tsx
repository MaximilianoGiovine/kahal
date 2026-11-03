'use client';

import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'kahal:theme';

/** Script que corre antes de pintar: evita el parpadeo del tema al cargar. */
export const THEME_SCRIPT = `try{document.documentElement.dataset.theme=localStorage.getItem('${KEY}')==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    read();
    window.addEventListener('kahal:theme', read);
    return () => window.removeEventListener('kahal:theme', read);
  }, []);
  const change = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* sin storage */
    }
    window.dispatchEvent(new Event('kahal:theme'));
  };
  return [theme, change] as const;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={clsx('inline-flex size-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted shadow-[inset_0_1px_0_var(--glass-highlight)] transition hover:bg-surface-3 hover:text-fg', className)}
      aria-label={next === 'light' ? 'Usar tema claro' : 'Usar tema oscuro'}
      title={next === 'light' ? 'Tema claro' : 'Tema oscuro'}
    >
      {theme === 'dark' ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </button>
  );
}
