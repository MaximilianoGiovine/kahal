'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Mail, MapPin, Phone, Radio } from 'lucide-react';
import { useEffect } from 'react';
import { Brand } from '@/components/brand';
import { ButtonLink, Card, ErrorState, Loading } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { dateTime, setTimezone } from '@/lib/format';
import type { ChurchEvent } from '@/lib/types';

interface PublicChurch {
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoKey: string | null;
  primaryColor: string | null;
  timezone: string;
  events: ChurchEvent[];
  live: { id: string; title: string } | null;
}

export function ChurchPublic({ slug }: { slug: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['public-church', slug],
    queryFn: () => api<PublicChurch>(`/public/churches/${slug}`),
  });

  useEffect(() => {
    if (!data) return;
    setTimezone(data.timezone);
    document.title = `${data.name} · Kahal`;
    if (data.primaryColor) document.documentElement.style.setProperty('--accent', data.primaryColor);
  }, [data]);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand />
        <ButtonLink href="/login" variant="secondary" size="sm">
          Ingresar
        </ButtonLink>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <section className="py-10">
          {data.logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(data.logoKey)} alt="" className="mb-6 size-20 rounded-2xl object-cover" />
          ) : (
            <span className="font-display mb-6 flex size-20 items-center justify-center rounded-2xl bg-accent text-3xl font-semibold text-accent-fg">{data.name[0]}</span>
          )}
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{data.name}</h1>
          {data.description && <p className="mt-4 max-w-2xl text-lg text-muted">{data.description}</p>}
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {data.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" /> {data.address}
              </span>
            )}
            {data.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="size-4" /> {data.phone}
              </span>
            )}
            {data.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="size-4" /> {data.email}
              </span>
            )}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={`/registro?iglesia=${data.slug}`}>Quiero ser parte</ButtonLink>
            <ButtonLink href="/login" variant="secondary">
              Ya soy miembro
            </ButtonLink>
          </div>
        </section>

        {data.live && (
          <Card className="mb-8 flex items-center gap-4 border-danger/30 bg-danger-soft p-5">
            <Radio className="size-6 shrink-0 animate-pulse text-danger" />
            <div className="flex-1">
              <p className="font-medium">Estamos en vivo: {data.live.title}</p>
              <p className="text-sm text-muted">Ingresá con tu cuenta para ver la transmisión.</p>
            </div>
          </Card>
        )}

        <h2 className="font-display text-xl font-semibold">Próximas actividades</h2>
        {data.events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No hay actividades publicadas por ahora.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.events.map((e) => (
              <Card key={e.id} className="p-5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-accent-ink">
                  <CalendarDays className="size-4" /> {dateTime(e.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="mt-2 font-semibold">{e.title}</p>
                {e.location && <p className="mt-1 text-sm text-muted">{e.location}</p>}
                {e.description && <p className="mt-2 line-clamp-3 text-sm text-muted">{e.description}</p>}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
