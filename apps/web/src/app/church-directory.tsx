'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Loading } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';

interface PublicChurch {
  name: string;
  slug: string;
  city: string | null;
  logoKey: string | null;
}

export function ChurchDirectory() {
  const { data, isLoading } = useQuery({ queryKey: ['public-churches'], queryFn: () => api<PublicChurch[]>('/public/churches') });
  if (isLoading) return <Loading />;
  if (!data?.length) return <p className="mt-6 text-sm text-muted">Todavía no hay iglesias registradas.</p>;
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((c) => (
        <Link key={c.slug} href={`/i/${c.slug}`} className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition hover:border-accent/50">
          {c.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(c.logoKey)} alt="" className="size-12 rounded-lg object-cover" />
          ) : (
            <span className="font-display flex size-12 items-center justify-center rounded-lg bg-accent-soft text-lg font-semibold text-accent-ink">{c.name[0]}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{c.name}</p>
            {c.city && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5" /> {c.city}
              </p>
            )}
          </div>
          <ChevronRight className="size-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-accent-ink" />
        </Link>
      ))}
    </div>
  );
}
