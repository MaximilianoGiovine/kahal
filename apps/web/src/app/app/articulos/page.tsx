'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusBadge, CampusFilter } from '@/components/campuses';
import { BookOpen, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { Badge, ButtonLink, Card, EmptyState, ErrorState, Input, Loading, PageHeader, Pagination } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { dateTime, fullName } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { ArticleSummary, Paged } from '@/lib/types';

const PAGE_SIZE = 12;

export default function ArticlesPage() {
  const { me } = useSession();
  const editor = can.articles(me);
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [page, setPage] = useState(1);
  const [campusId, setCampusId] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['articles', search, campusId, page],
    queryFn: () => api<Paged<ArticleSummary>>('/articles', { query: { q: search, campusId, page, pageSize: PAGE_SIZE } }),
    placeholderData: (p) => p,
  });

  return (
    <>
      <PageHeader
        title="Artículos"
        description="Lecturas y reflexiones escritas por la iglesia para la congregación."
        actions={
          editor && (
            <ButtonLink href="/app/articulos/nuevo">
              <Plus className="size-4" /> Nuevo artículo
            </ButtonLink>
          )
        }
      />
      {editor && <CampusFilter aspect="ARTICLES" value={campusId} onChange={(id) => (setCampusId(id), setPage(1))} noneLabel="Generales" className="mb-3 sm:w-64" />}
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar artículos"
          className="pl-9"
          aria-label="Buscar artículos"
        />
      </div>

      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title={search ? 'No se encontraron artículos' : 'Todavía no hay artículos'}
            description={editor && !search ? 'Escribe el primero o impórtalo desde un documento de Word o PDF.' : undefined}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((a) => (
              <Link key={a.id} href={`/app/articulos/${a.id}`} className="group">
                <Card className="flex h-full flex-col overflow-hidden transition group-hover:border-accent/50">
                  {a.coverKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(a.coverKey)} alt="" className="aspect-[16/9] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[16/9] items-center justify-center bg-accent-soft text-accent-ink">
                      <BookOpen className="size-8 opacity-60" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    {!a.published && (
                      <Badge tone="warning" className="mb-2 w-fit">
                        Borrador
                      </Badge>
                    )}
                    <div className="mb-2 empty:hidden">
                      <CampusBadge aspect="ARTICLES" campus={a.campus} />
                    </div>
                    <h2 className="font-display text-lg leading-snug font-semibold group-hover:text-accent-ink">{a.title}</h2>
                    {a.summary && <p className="mt-1.5 line-clamp-3 text-sm text-muted">{a.summary}</p>}
                    <p className="mt-auto pt-4 text-xs text-subtle">
                      {dateTime(a.publishedAt, { dateStyle: 'long' })}
                      {a.author && ` · ${fullName(a.author)}`}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          {data.total > PAGE_SIZE && (
            <Card className="mt-4">
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
            </Card>
          )}
        </>
      )}
    </>
  );
}
