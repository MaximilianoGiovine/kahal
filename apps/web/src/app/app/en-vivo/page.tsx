'use client';

import { useQuery } from '@tanstack/react-query';
import { CampusBadge, CampusField, CampusFilter, useCanManageCampus } from '@/components/campuses';
import { ExternalLink, MonitorPlay, Pencil, Plus, Radio, Square, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { ActionMenu } from '@/components/menu';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import { isUnplayableFacebook, streamEmbedUrl, PLATFORM_LABEL, STREAM_CHANNELS, type StreamChannels } from '@/lib/embed';
import { formValues, useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Stream } from '@/lib/types';

interface Streams {
  live: Stream | null;
  upcoming: Stream[];
  past: Stream[];
}

/** Canales de transmisión configurados por la iglesia (Configuración → Iglesia). */
function useChurchChannels() {
  const { church } = useSession();
  const { data } = useQuery({
    queryKey: ['public-church', church?.slug],
    queryFn: () => api<StreamChannels>(`/public/churches/${church!.slug}`),
    enabled: !!church,
  });
  return STREAM_CHANNELS.flatMap((c) => (data?.[c.key] ? [{ ...c, url: data[c.key]! }] : []));
}

export default function LivePage() {
  const { me } = useSession();
  const channels = useChurchChannels();
  const editor = can.content(me);
  const canManage = useCanManageCampus('STREAMS');
  const [campusId, setCampusId] = useState('');
  const [editing, setEditing] = useState<Stream | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Stream | null>(null);
  const [watching, setWatching] = useState<Stream | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['streams', campusId],
    queryFn: () => api<Streams>('/streams', { query: { campusId } }),
    refetchInterval: 60_000,
  });
  const inv = { invalidate: [['streams'], ['dashboard']] };
  const setLive = useAction(({ id, isLive }: { id: string; isLive: boolean }) => api(`/streams/${id}/live`, { method: 'POST', body: { isLive } }), {
    ...inv,
    success: 'Transmisión actualizada',
  });
  const remove = useAction((id: string) => api(`/streams/${id}`, { method: 'DELETE' }), { ...inv, success: 'Transmisión eliminada', onSuccess: () => setDeleting(null) });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const current = watching ?? data.live;

  const actions = (s: Stream) => canManage(s.campusId) && (
    <ActionMenu
      items={[
        { label: 'Marcar en vivo', icon: Radio, onClick: () => setLive.mutate({ id: s.id, isLive: true }), hidden: s.isLive },
        { label: 'Finalizar transmisión', icon: Square, onClick: () => setLive.mutate({ id: s.id, isLive: false }), hidden: !s.isLive },
        { label: 'Editar', icon: Pencil, onClick: () => setEditing(s) },
        { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(s) },
      ]}
    />
  );

  return (
    <>
      <PageHeader
        title="En vivo"
        description="Transmisiones de los cultos y reuniones."
        actions={
          editor && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Nueva transmisión
            </Button>
          )
        }
      />

      {editor && <CampusFilter aspect="STREAMS" value={campusId} onChange={(id) => (setCampusId(id), setWatching(null))} noneLabel="Generales" className="mb-4 sm:w-64" />}

      {current ? (
        <Card className="overflow-hidden">
          <Player stream={current} />
          <div className="flex items-start justify-between gap-3 p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {current.isLive ? (
                  <Badge tone="danger">
                    <span className="size-1.5 animate-pulse rounded-full bg-current" /> EN VIVO
                  </Badge>
                ) : (
                  <Badge>Grabación</Badge>
                )}
                <span className="text-xs text-muted">{PLATFORM_LABEL[current.platform]}</span>
                <CampusBadge aspect="STREAMS" campus={current.campus} />
              </div>
              <h2 className="mt-1.5 text-lg font-semibold">{current.title}</h2>
              {current.description && <p className="mt-1 text-sm text-muted">{current.description}</p>}
            </div>
            <div className="flex items-center gap-1">
              <a href={current.url} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Abrir en la plataforma">
                <ExternalLink className="size-5" />
              </a>
              {editor && actions(current)}
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<MonitorPlay className="size-5" />}
            title="No hay ninguna transmisión en vivo"
            description={data.upcoming[0] ? `Próxima: ${data.upcoming[0].title}, ${dateTime(data.upcoming[0].scheduledAt)}` : 'Cuando la iglesia esté en vivo la vas a ver aquí.'}
          />
          {channels.length > 0 && (
            <div className="-mt-4 flex flex-wrap justify-center gap-2 px-5 pb-8">
              {channels.map((c) => (
                <a key={c.key} href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
                  Síguenos en {c.label} <ExternalLink className="size-3.5" />
                </a>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <StreamList title="Próximas" items={data.upcoming} empty="No hay transmisiones programadas" onPlay={setWatching} actions={editor ? actions : undefined} />
        <StreamList title="Anteriores" items={data.past} empty="Todavía no hay grabaciones" onPlay={setWatching} actions={editor ? actions : undefined} />
      </div>

      {editing && <StreamForm item={editing === 'new' ? null : editing} channels={channels} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar transmisión"
        message={`¿Eliminar "${deleting?.title}"?`}
        confirmLabel="Eliminar"
      />
    </>
  );
}

function Player({ stream }: { stream: Stream }) {
  const src = streamEmbedUrl(stream);
  if (!src) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-black text-white">
        <MonitorPlay className="size-10 opacity-70" />
        {isUnplayableFacebook(stream.url) && (
          <p className="max-w-sm px-4 text-center text-sm opacity-80">Facebook no permite reproducir este enlace dentro de Kahal. Puedes verlo directamente en Facebook.</p>
        )}
        <a href={stream.url} target="_blank" rel="noreferrer" className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">
          Abrir transmisión
        </a>
      </div>
    );
  }
  return (
    <div className="aspect-video bg-black">
      <iframe
        key={src}
        src={src}
        title={stream.title}
        className="size-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

function StreamList({
  title,
  items,
  empty,
  onPlay,
  actions,
}: {
  title: string;
  items: Stream[];
  empty: string;
  onPlay: (s: Stream) => void;
  actions?: (s: Stream) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <button onClick={() => onPlay(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <MonitorPlay className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-muted">{s.scheduledAt ? dateTime(s.scheduledAt) : 'Sin fecha'}</span>
                </span>
              </button>
              {actions?.(s)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StreamForm({ item, channels, onClose }: { item: Stream | null; channels: ReturnType<typeof useChurchChannels>; onClose: () => void }) {
  const [url, setUrl] = useState(item?.url ?? '');
  const save = useAction(
    (body: Record<string, unknown>) => (item ? api(`/streams/${item.id}`, { method: 'PATCH', body }) : api('/streams', { method: 'POST', body })),
    { success: 'Transmisión guardada', invalidate: [['streams'], ['dashboard']], onSuccess: onClose },
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    save.mutate({ ...v, scheduledAt: fromLocalInput(v.scheduledAt as string) });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Editar transmisión' : 'Nueva transmisión'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="stream-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="stream-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Título">
          <Input name="title" required minLength={2} defaultValue={item?.title} placeholder="Culto dominical" />
        </Field>
        <CampusField aspect="STREAMS" current={item?.campusId} emptyLabel="Toda la iglesia" hint="Si eliges una sede, solo la ven y reciben el aviso quienes pertenecen a ella." />
        <Field label="Enlace de la transmisión" hint="Pega el enlace del video o de la transmisión en vivo de YouTube, Facebook o Twitch. En Twitch basta con el enlace del canal. Si en Configuración activaste la publicación automática, YouTube y Twitch no necesitan este paso.">
          <Input name="url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        </Field>
        {isUnplayableFacebook(url) && (
          <p className="-mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            Este enlace de Facebook no se puede ver dentro de Kahal: solo se pueden reproducir videos concretos y públicos. Abre el video en Facebook desde una computadora y copia el enlace de la barra de direcciones (tiene la forma facebook.com/tu-iglesia/videos/123…). Los enlaces de página, los de fb.watch y los de «Compartir» solo se abren en Facebook.
          </p>
        )}
        {channels.length > 0 && (
          <div className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            Usar canal de la iglesia:
            {channels.map((c) => (
              <button key={c.key} type="button" onClick={() => setUrl(c.url)} className="rounded-full border border-border px-2.5 py-1 hover:bg-surface-2 hover:text-fg">
                {c.label}
              </button>
            ))}
          </div>
        )}
        <Field label="Fecha y hora">
          <Input name="scheduledAt" type="datetime-local" defaultValue={toLocalInput(item?.scheduledAt)} />
        </Field>
        <Field label="Descripción">
          <Textarea name="description" rows={3} defaultValue={item?.description ?? ''} />
        </Field>
        <Checkbox name="isLive" label="Está en vivo ahora (reemplaza a la transmisión actual de la misma sede)" defaultChecked={item?.isLive} />
      </form>
    </Dialog>
  );
}
