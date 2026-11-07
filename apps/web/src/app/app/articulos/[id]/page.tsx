'use client';

import { CampusBadge, useCanManageCampus } from '@/components/campuses';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileDown, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/dialog';
import { Badge, Button, ButtonLink, ErrorState, Loading } from '@/components/ui';
import { api, download, fileUrl } from '@/lib/api';
import { dateTime, fullName } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Article } from '@/lib/types';

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, church } = useSession();
  const canManage = useCanManageCampus('ARTICLES');
  const editor = can.articles(me);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { data: a, isLoading, error, refetch } = useQuery({ queryKey: ['articles', 'detail', id], queryFn: () => api<Article>(`/articles/${id}`) });
  const remove = useAction(() => api(`/articles/${id}`, { method: 'DELETE' }), {
    success: 'Artículo eliminado',
    invalidate: [['articles']],
    onSuccess: () => router.replace('/app/articulos'),
  });

  async function exportPdf() {
    setExporting(true);
    try {
      await download(`/articles/${id}/pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el PDF');
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) return <Loading />;
  if (error || !a) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/articulos" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Artículos
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportPdf} loading={exporting} title={`PDF con marca de agua de ${church?.name ?? 'la iglesia'}`}>
            {!exporting && <FileDown className="size-4" />} Descargar PDF
          </Button>
          {editor && canManage(a.campusId) && (
            <>
              <ButtonLink variant="secondary" href={`/app/articulos/${a.id}/editar`}>
                <Pencil className="size-4" /> Editar
              </ButtonLink>
              <Button variant="ghost" onClick={() => setDeleting(true)} aria-label="Eliminar artículo" className="text-danger hover:text-danger">
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <article className="mx-auto max-w-3xl">
        {!a.published && (
          <Badge tone="warning" className="mb-3">
            Borrador: no visible para la congregación
          </Badge>
        )}
        <div className="mb-3 empty:hidden">
          <CampusBadge aspect="ARTICLES" campus={a.campus} />
        </div>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{a.title}</h1>
        <p className="mt-3 text-sm text-muted">
          {a.author && `Por ${fullName(a.author)} · `}
          {dateTime(a.publishedAt, { dateStyle: 'long' })}
        </p>
        {a.summary && <p className="mt-5 text-lg leading-relaxed text-muted italic">{a.summary}</p>}
        {a.coverKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(a.coverKey)} alt="" className="mt-6 max-h-[28rem] w-full rounded-xl object-cover" />
        )}
        {/* El HTML viene saneado por la API (lista cerrada de etiquetas y atributos). */}
        <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: a.body }} />
        <p className="mt-12 border-t border-border pt-4 text-xs text-subtle">
          © {new Date(a.publishedAt).getFullYear()} {church?.name}. Contenido original de la iglesia.
        </p>
      </article>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        danger
        title="Eliminar artículo"
        message={`¿Eliminar "${a.title}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
      />
    </>
  );
}
