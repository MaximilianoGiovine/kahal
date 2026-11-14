'use client';

import { useQuery } from '@tanstack/react-query';
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/dialog';
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, Loading, PageHeader, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { PlatformPostSummary } from '@/lib/types';

function status(p: PlatformPostSummary) {
  const now = Date.now();
  if (!p.published) return <Badge tone="warning">Borrador</Badge>;
  if (p.expiresAt && new Date(p.expiresAt).getTime() <= now) return <Badge>Vencido</Badge>;
  if (new Date(p.publishedAt).getTime() > now) return <Badge tone="accent">Programado</Badge>;
  return <Badge tone="success">Visible</Badge>;
}

export default function PlatformPostsAdminPage() {
  const { isSuperAdmin } = useSession();
  const [deleting, setDeleting] = useState<PlatformPostSummary | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform-posts', 'manage'],
    queryFn: () => api<PlatformPostSummary[]>('/platform-posts/manage'),
    enabled: isSuperAdmin,
  });
  const remove = useAction((id: string) => api(`/platform-posts/${id}`, { method: 'DELETE' }), {
    success: 'Publicación eliminada',
    invalidate: [['platform-posts']],
    onSuccess: () => setDeleting(null),
  });

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;

  return (
    <>
      <PageHeader
        title="Noticias y avisos"
        description="Publicaciones de Kahal que aparecen en la página de Artículos de todas las iglesias."
        actions={
          <ButtonLink href="/app/admin/noticias/nuevo">
            <Plus className="size-4" /> Nueva publicación
          </ButtonLink>
        }
      />
      <Card>
        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length === 0 ? (
          <EmptyState icon={<Megaphone className="size-5" />} title="Todavía no hay publicaciones" description="Escribe una noticia o un aviso para todas las iglesias." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>Título</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Estado</th>
                  <th className={th}>Publicado</th>
                  <th className={th}>Vence</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className={td}>
                      <Link href={`/app/admin/noticias/${p.id}`} className="font-medium hover:text-accent-ink">
                        {p.title}
                      </Link>
                    </td>
                    <td className={td}>{p.kind === 'NOTICE' ? <Badge tone="accent">Aviso</Badge> : <Badge>Noticia</Badge>}</td>
                    <td className={td}>{status(p)}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{dateTime(p.publishedAt)}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{p.expiresAt ? dateTime(p.expiresAt) : '—'}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <ButtonLink variant="ghost" size="sm" href={`/app/admin/noticias/${p.id}`} aria-label="Editar">
                        <Pencil className="size-4" />
                      </ButtonLink>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(p)} aria-label="Eliminar" className="text-danger hover:text-danger">
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar publicación"
        message={`¿Eliminar "${deleting?.title}"? Deja de verse en todas las iglesias.`}
        confirmLabel="Eliminar"
      />
    </>
  );
}
