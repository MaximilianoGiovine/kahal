'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BrandIcon } from '@/components/brand';
import { Badge, ButtonLink, ErrorState, Loading } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { PlatformPost } from '@/lib/types';

/** Lectura de una noticia o aviso de Kahal. */
export default function PlatformPostPage() {
  const { id } = useParams<{ id: string }>();
  const { isSuperAdmin } = useSession();
  const { data: p, isLoading, error, refetch } = useQuery({ queryKey: ['platform-posts', 'detail', id], queryFn: () => api<PlatformPost>(`/platform-posts/${id}`) });

  if (isLoading) return <Loading />;
  if (error || !p) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/articulos" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Artículos
        </Link>
        {isSuperAdmin && (
          <ButtonLink variant="secondary" href={`/app/admin/noticias/${p.id}`}>
            <Pencil className="size-4" /> Editar
          </ButtonLink>
        )}
      </div>

      <article className="mx-auto max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="accent" className="inline-flex items-center gap-1.5">
            <BrandIcon className="size-3.5" /> {p.kind === 'NOTICE' ? 'Aviso de Kahal' : 'Noticia de Kahal'}
          </Badge>
          {!p.published && <Badge tone="warning">Borrador: no visible para las iglesias</Badge>}
        </div>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{p.title}</h1>
        <p className="mt-3 text-sm text-muted">{dateTime(p.publishedAt, { dateStyle: 'long' })}</p>
        {p.summary && <p className="mt-5 text-lg leading-relaxed text-muted italic">{p.summary}</p>}
        {p.coverKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(p.coverKey)} alt="" className="mt-6 max-h-[28rem] w-full rounded-xl object-cover" />
        )}
        {/* El HTML viene saneado por la API (lista cerrada de etiquetas y atributos). */}
        <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: p.body }} />
      </article>
    </>
  );
}
