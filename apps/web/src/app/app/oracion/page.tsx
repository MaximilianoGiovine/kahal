'use client';

import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Check, Copy, HandHeart, Lock, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { ActionMenu } from '@/components/menu';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Loading, PageHeader, Pagination, Select, Tabs, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import type { Paged } from '@/lib/types';

type View = 'active' | 'answered' | 'archived';

interface PrayerRequest {
  id: string;
  /** Null si es anónima y no la pidió quien mira. */
  userId: string | null;
  authorName: string | null;
  body: string;
  shared: boolean;
  anonymous: boolean;
  answeredAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  mine: boolean;
}

const PAGE_SIZE = 20;
const INVALIDATE = { invalidate: [['prayers']] };

export default function PrayersPage() {
  const [view, setView] = useState<View>('active');
  const [mine, setMine] = useState(false);
  const [days, setDays] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PrayerRequest | null>(null);
  const [copying, setCopying] = useState(false);
  const filter = { view, mine: mine || undefined, days: days || undefined };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['prayers', view, mine, days, page],
    queryFn: () => api<Paged<PrayerRequest> & { team: boolean }>('/prayer-requests', { query: { ...filter, page, pageSize: PAGE_SIZE } }),
    placeholderData: (p) => p,
  });
  const team = !!data?.team;

  const update = useAction(({ id, ...body }: { id: string; answered?: boolean; archived?: boolean }) => api(`/prayer-requests/${id}`, { method: 'PATCH', body }), {
    ...INVALIDATE,
    success: 'Petición actualizada',
  });
  const remove = useAction((id: string) => api(`/prayer-requests/${id}`, { method: 'DELETE' }), { ...INVALIDATE, success: 'Petición eliminada', onSuccess: () => setDeleting(null) });

  /** Copia todas las del filtro, no solo la página visible. */
  async function copyAll() {
    setCopying(true);
    try {
      const { text, count, truncated } = await api<{ text: string; count: number; truncated: boolean }>('/prayer-requests/text', { query: filter });
      if (!count) {
        toast.info('No hay peticiones para copiar con estos filtros');
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success(truncated ? `Se copiaron las primeras ${count} peticiones` : `${count} ${count === 1 ? 'petición copiada' : 'peticiones copiadas'}`, {
        description: 'Ya puedes pegarlas en un mensaje o documento.',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron copiar');
    } finally {
      setCopying(false);
    }
  }

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Peticiones de oración"
        description={team ? 'Todas las peticiones de la iglesia. Al copiar, las anónimas van sin nombre.' : 'Comparte tu pedido y ora por los de la congregación.'}
        actions={
          <>
            <Button variant="secondary" loading={copying} onClick={copyAll}>
              <Copy className="size-4" /> Copiar todas
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Nueva petición
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs
          value={view}
          onChange={reset(setView)}
          items={[
            { value: 'active', label: 'Activas' },
            { value: 'answered', label: 'Respondidas' },
            ...(team ? [{ value: 'archived' as View, label: 'Archivadas' }] : []),
          ]}
        />
        <div className="grid grid-cols-2 gap-3 sm:ml-auto sm:w-96">
          <Select value={days} onChange={(e) => reset(setDays)(e.target.value)} aria-label="Período">
            <option value="">Todas las fechas</option>
            <option value="1">Últimas 24 horas</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
          </Select>
          <Select value={mine ? 'mine' : ''} onChange={(e) => reset(setMine)(e.target.value === 'mine')} aria-label="De quién">
            <option value="">{team ? 'De toda la iglesia' : 'Compartidas y mías'}</option>
            <option value="mine">Solo las mías</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HandHeart className="size-5" />}
            title={view === 'answered' ? 'Todavía no hay peticiones respondidas' : view === 'archived' ? 'No hay peticiones archivadas' : 'No hay peticiones activas'}
            description={view === 'active' ? 'Escribe tu pedido y la iglesia orará por ti.' : undefined}
            action={
              view === 'active' && (
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" /> Nueva petición
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((p) => (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.authorName ?? 'Anónimo'}</p>
                    <p className="tabular text-xs text-muted">{dateTime(p.createdAt)}</p>
                  </div>
                  {(p.mine || team) && (
                    <ActionMenu
                      items={[
                        { label: 'Marcar como respondida', icon: Check, onClick: () => update.mutate({ id: p.id, answered: true }), hidden: !!p.answeredAt },
                        { label: 'Volver a activas', icon: RotateCcw, onClick: () => update.mutate({ id: p.id, answered: false }), hidden: !p.answeredAt },
                        { label: 'Archivar', icon: Archive, onClick: () => update.mutate({ id: p.id, archived: true }), hidden: !team || !!p.archivedAt },
                        { label: 'Desarchivar', icon: ArchiveRestore, onClick: () => update.mutate({ id: p.id, archived: false }), hidden: !team || !p.archivedAt },
                        { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(p) },
                      ]}
                    />
                  )}
                </div>
                <p className="mt-3 flex-1 text-sm break-words whitespace-pre-line">{p.body}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.answeredAt && <Badge tone="success">Respondida</Badge>}
                  {(p.mine || team) &&
                    (p.shared ? (
                      <Badge>
                        <Users className="size-3" /> Compartida
                      </Badge>
                    ) : (
                      <Badge>
                        <Lock className="size-3" /> Solo el equipo
                      </Badge>
                    ))}
                  {(p.mine || team) && p.anonymous && <Badge>Sin nombre para la congregación</Badge>}
                  {p.mine && <Badge tone="accent">Tuya</Badge>}
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}

      {creating && <PrayerForm onClose={() => setCreating(false)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar petición"
        message="¿Eliminar esta petición de oración? No se puede deshacer."
        confirmLabel="Eliminar"
      />
    </>
  );
}

function PrayerForm({ onClose }: { onClose: () => void }) {
  const save = useAction((body: Record<string, unknown>) => api('/prayer-requests', { method: 'POST', body }), {
    ...INVALIDATE,
    success: 'Recibimos tu petición. ¡Estaremos orando!',
    onSuccess: onClose,
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate(formValues(e.currentTarget));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nueva petición de oración"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="prayer-form" loading={save.isPending}>
            Enviar
          </Button>
        </>
      }
    >
      <form id="prayer-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="¿Por qué quieres que oremos?">
          <Textarea name="body" required minLength={3} maxLength={2000} rows={5} autoFocus />
        </Field>
        <Checkbox name="shared" label="Compartirla con la congregación. Si no, solo la ve el equipo de oración." />
        <Checkbox name="anonymous" label="No mostrar mi nombre a la congregación (el equipo de oración sí lo ve)." />
      </form>
    </Dialog>
  );
}
