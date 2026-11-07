'use client';

import { useQuery } from '@tanstack/react-query';
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CampusBadge, CampusField, CampusFilter, useCanManageCampus } from '@/components/campuses';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { ImageUpload } from '@/components/image-upload';
import { ActionMenu } from '@/components/menu';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Pagination, Textarea } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { dateTime, fullName } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Announcement, Paged } from '@/lib/types';

export default function AnnouncementsPage() {
  const { me } = useSession();
  const editor = can.content(me);
  const canManage = useCanManageCampus('ANNOUNCEMENTS');
  const [campusId, setCampusId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['announcements', campusId, page],
    queryFn: () => api<Paged<Announcement>>('/announcements', { query: { campusId, page, pageSize: 10 } }),
  });
  const remove = useAction((id: string) => api(`/announcements/${id}`, { method: 'DELETE' }), {
    success: 'Novedad eliminada',
    invalidate: [['announcements'], ['dashboard']],
    onSuccess: () => setDeleting(null),
  });

  return (
    <>
      <PageHeader
        title="Novedades"
        description="Anuncios y noticias de la iglesia."
        actions={
          editor && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Nueva novedad
            </Button>
          )
        }
      />
      {editor && <CampusFilter aspect="ANNOUNCEMENTS" value={campusId} onChange={(id) => (setCampusId(id), setPage(1))} noneLabel="Generales" className="mb-4 sm:w-64" />}
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone className="size-5" />} title="Todavía no hay novedades" description={editor ? 'Publica la primera para toda la congregación.' : undefined} />
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              {a.imageKey && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(a.imageKey)} alt="" className="max-h-72 w-full object-cover" />
              )}
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.pinned && (
                        <Badge tone="accent">
                          <Pin className="size-3" /> Destacada
                        </Badge>
                      )}
                      {!a.published && <Badge tone="warning">Borrador</Badge>}
                      <CampusBadge aspect="ANNOUNCEMENTS" campus={a.campus} />
                    </div>
                    <h2 className="mt-1.5 text-lg font-semibold">{a.title}</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {dateTime(a.publishedAt, { dateStyle: 'long' })}
                      {a.author && ` · ${fullName(a.author)}`}
                    </p>
                  </div>
                  {editor && canManage(a.campusId) && (
                    <ActionMenu
                      items={[
                        { label: 'Editar', icon: Pencil, onClick: () => setEditing(a) },
                        { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(a) },
                      ]}
                    />
                  )}
                </div>
                <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line">{a.body}</p>
              </div>
            </Card>
          ))}
          <Card>
            <Pagination page={page} pageSize={10} total={data.total} onChange={setPage} />
          </Card>
        </div>
      )}

      {editing && <AnnouncementForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar novedad"
        message={`¿Eliminar "${deleting?.title}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
      />
    </>
  );
}

function AnnouncementForm({ item, onClose }: { item: Announcement | null; onClose: () => void }) {
  const save = useAction(
    (body: Record<string, unknown>) => (item ? api(`/announcements/${item.id}`, { method: 'PATCH', body }) : api('/announcements', { method: 'POST', body })),
    { success: item ? 'Novedad actualizada' : 'Novedad publicada', invalidate: [['announcements'], ['dashboard']], onSuccess: onClose },
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate(formValues(e.currentTarget));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Editar novedad' : 'Nueva novedad'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="announcement-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Título">
          <Input name="title" required minLength={2} maxLength={160} defaultValue={item?.title} />
        </Field>
        <CampusField aspect="ANNOUNCEMENTS" current={item?.campusId} emptyLabel="Toda la iglesia" hint="Si eliges una sede, solo la ven y reciben el aviso quienes pertenecen a ella." />
        <Field label="Contenido">
          <Textarea name="body" required rows={7} defaultValue={item?.body} />
        </Field>
        <ImageUpload name="imageKey" defaultKey={item?.imageKey} />
        <div className="flex flex-wrap gap-6">
          <Checkbox name="pinned" label="Destacar arriba" defaultChecked={item?.pinned} />
          <Checkbox name="published" label="Publicada (visible para miembros)" defaultChecked={item?.published ?? true} />
        </div>
      </form>
    </Dialog>
  );
}
