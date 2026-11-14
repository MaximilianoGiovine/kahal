'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Megaphone, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BrandIcon } from '@/components/brand';
import { Badge, Button, Card } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { PlatformFeed } from '@/lib/types';

const STEP = 3;

/** Avisos y noticias de Kahal, comunes a todas las iglesias, arriba de los artículos. */
export function PlatformFeedSection() {
  const [limit, setLimit] = useState(STEP);
  const { data } = useQuery({
    queryKey: ['platform-posts', 'feed', limit],
    queryFn: () => api<PlatformFeed>('/platform-posts', { query: { limit } }),
    placeholderData: (p) => p,
  });
  if (!data || (!data.notices.length && !data.news.length)) return null;

  return (
    <section className="mb-8 space-y-4" aria-label="Noticias y avisos de Kahal">
      {data.notices.map((n) => (
        <Link key={n.id} href={`/app/articulos/kahal/${n.id}`} className="group block">
          <Card className="flex items-start gap-4 border-accent/40 p-4 transition group-hover:border-accent sm:p-5">
            <span className="bg-accent-gradient grid size-10 shrink-0 place-items-center rounded-xl text-accent-fg shadow-glow">
              <Megaphone className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-accent-ink">Aviso de Kahal · {dateTime(n.publishedAt, { dateStyle: 'medium' })}</p>
              <h2 className="font-display mt-0.5 font-semibold group-hover:text-accent-ink">{n.title}</h2>
              {n.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{n.summary}</p>}
            </div>
            <ChevronRight className="mt-2 size-5 shrink-0 text-subtle group-hover:text-accent-ink" />
          </Card>
        </Link>
      ))}

      {data.news.length > 0 && (
        <div>
          <h2 className="font-display mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
            <BrandIcon className="size-4" /> Noticias de Kahal
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.news.map((a) => (
              <Link key={a.id} href={`/app/articulos/kahal/${a.id}`} className="group">
                <Card className="flex h-full flex-col overflow-hidden transition group-hover:border-accent/50">
                  {a.coverKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(a.coverKey)} alt="" className="aspect-[16/9] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[16/9] items-center justify-center bg-accent-soft text-accent-ink">
                      <Newspaper className="size-8 opacity-60" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <Badge tone="accent" className="mb-2 w-fit">
                      Kahal
                    </Badge>
                    <h3 className="font-display text-lg leading-snug font-semibold group-hover:text-accent-ink">{a.title}</h3>
                    {a.summary && <p className="mt-1.5 line-clamp-3 text-sm text-muted">{a.summary}</p>}
                    <p className="mt-auto pt-4 text-xs text-subtle">{dateTime(a.publishedAt, { dateStyle: 'long' })}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          {data.newsTotal > data.news.length && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setLimit((l) => l + STEP * 2)}>
              Ver más noticias de Kahal
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
