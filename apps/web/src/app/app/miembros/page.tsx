'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, Pencil, Plus, Search, Smartphone, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CampusFilter, useCampuses } from '@/components/campuses';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { MemberForm } from '@/components/member-form';
import { StatusBadge, StatusBadges, useMemberStatuses } from '@/components/member-statuses';
import { ActionMenu } from '@/components/menu';
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Pagination, Select, Stat, Tabs, Textarea, td, th } from '@/components/ui';
import { api, download } from '@/lib/api';
import { fullName, number } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Family, Member, MemberStatus, Ministry, Paged, StatusRef } from '@/lib/types';

type Tab = 'members' | 'families' | 'ministries' | 'statuses';

export default function MembersPage() {
  const [tab, setTab] = useState<Tab>('members');
  return (
    <>
      <PageHeader title="Miembros" description="Registro de la congregación, familias, ministerios y estados." />
      <div className="mb-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'members', label: 'Listado' },
            { value: 'families', label: 'Familias' },
            { value: 'ministries', label: 'Ministerios' },
            { value: 'statuses', label: 'Estados' },
          ]}
        />
      </div>
      {tab === 'members' && <MembersTab />}
      {tab === 'families' && <FamiliesTab />}
      {tab === 'ministries' && <MinistriesTab />}
      {tab === 'statuses' && <StatusesTab />}
    </>
  );
}

function MembersTab() {
  const router = useRouter();
  const editor = can.editMembers(useSession().me);
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [status, setStatus] = useState('');
  const [ministryId, setMinistryId] = useState('');
  const [source, setSource] = useState<'' | 'app' | 'manual'>('');
  const [campusId, setCampusId] = useState('');
  const showCampus = !!useCampuses().data?.enabled;
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filters = { q: query, statusId: status, ministryId, source, campusId };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['members', filters, page],
    queryFn: () => api<Paged<Member>>('/members', { query: { ...filters, page, pageSize: 25 } }),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({
    queryKey: ['members', 'stats', campusId],
    queryFn: () => api<{ total: number; newThisMonth: number; fromApp: number; fromAppThisMonth: number; byStatus: (StatusRef & { count: number })[] }>('/members/stats', { query: { campusId } }),
  });
  const { data: ministries = [] } = useQuery({ queryKey: ['ministries'], queryFn: () => api<Ministry[]>('/ministries') });
  const { data: statuses = [] } = useMemberStatuses();

  async function exportXlsx() {
    setExporting(true);
    try {
      await download('/members/export', filters);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {stats && (
        <div className="mb-6 grid gap-3 lg:grid-cols-4">
          <Stat label="Total de miembros" value={number(stats.total)} hint={`${stats.newThisMonth} nuevos este mes`} />
          {/* Quienes se registran en la app ya quedan en el padrón con sus datos: no hace falta cargarlos. */}
          <button
            type="button"
            onClick={() => (setSource(source === 'app' ? '' : 'app'), setPage(1))}
            aria-pressed={source === 'app'}
            className="rounded-xl border border-border bg-surface p-5 text-left transition hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent-soft"
          >
            <span className="flex items-center justify-between text-sm text-muted">
              Registrados en la app <Smartphone className="size-4" />
            </span>
            <span className="tabular mt-2 block text-2xl font-semibold tracking-tight">{number(stats.fromApp)}</span>
            <span className="mt-1 block text-xs text-muted">{stats.fromAppThisMonth} este mes · toca para filtrar</span>
          </button>
          {stats.byStatus.length > 0 && (
            <Card className="p-4 lg:col-span-2">
              <p className="text-sm text-muted">Por estado</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {stats.byStatus.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => (setStatus(status === s.id ? '' : s.id), setPage(1))}
                    aria-pressed={status === s.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent-soft"
                  >
                    <StatusBadge status={s} />
                    <span className="font-semibold tabular-nums">{number(s.count)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre, email, documento o teléfono"
              className="pl-9"
              aria-label="Buscar miembros"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:order-last lg:basis-full lg:auto-cols-fr lg:grid-flow-col">
            <CampusFilter value={campusId} onChange={(id) => (setCampusId(id), setPage(1))} noneLabel="Sin sede" className="col-span-2 sm:col-span-1" />
            <Select value={source} onChange={(e) => (setSource(e.target.value as typeof source), setPage(1))} aria-label="Origen" className="col-span-2 sm:col-span-1">
              <option value="">Todos los orígenes</option>
              <option value="app">Registrados en la app</option>
              <option value="manual">Agregados por la iglesia</option>
            </Select>
            <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Estado">
              <option value="">Todos los estados</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select value={ministryId} onChange={(e) => (setMinistryId(e.target.value), setPage(1))} aria-label="Ministerio">
              <option value="">Todos los ministerios</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportXlsx} loading={exporting} className="flex-1">
              <Download className="size-4" /> Excel
            </Button>
            {editor && (
              <Button onClick={() => setCreating(true)} className="flex-1">
                <Plus className="size-4" /> Agregar
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No se encontraron miembros" description="Prueba con otros filtros o agrega un miembro nuevo." />
        ) : (
          <>
            {/* Tabla escritorio */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="border-b border-border bg-surface-2/50">
                  <tr>
                    <th className={th}>Nombre</th>
                    {showCampus && <th className={th}>Sede</th>}
                    <th className={th}>Estado</th>
                    <th className={th}>Contacto</th>
                    <th className={th}>Ministerios</th>
                    <th className={th}>Familia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((m) => (
                    <tr key={m.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => router.push(`/app/miembros/${m.id}`)}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <Avatar name={m} size={32} />
                          <div>
                            <Link href={`/app/miembros/${m.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                              {m.lastName}, {m.firstName}
                            </Link>
                            {m.user && (
                              <p className="flex items-center gap-1 text-xs text-muted">
                                <Smartphone className="size-3" /> Registrado/a en la app
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      {showCampus && <td className={`${td} whitespace-nowrap text-muted`}>{m.campus?.name ?? '—'}</td>}
                      <td className={td}>
                        <StatusBadges statuses={m.statuses} />
                      </td>
                      <td className={`${td} text-muted`}>
                        <div className="max-w-56 truncate">{m.email ?? '—'}</div>
                        <div className="text-xs">{m.phone}</div>
                      </td>
                      <td className={`${td} text-muted`}>
                        <div className="max-w-56 truncate">{m.ministries?.map((x) => x.ministry.name).join(', ') || '—'}</div>
                      </td>
                      <td className={`${td} text-muted`}>{m.family?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Lista móvil */}
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((m) => (
                <li key={m.id}>
                  <Link href={`/app/miembros/${m.id}`} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={m} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{fullName(m)}</p>
                      <p className="truncate text-xs text-muted">
                        {showCampus && m.campus && `${m.campus.name} · `}
                        {m.phone ?? m.email ?? '—'}
                      </p>
                    </div>
                    <span className="max-w-[45%] text-right">
                      <StatusBadges statuses={m.statuses} empty="" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={25} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      {creating && <MemberForm member={null} onClose={() => setCreating(false)} onSaved={(m) => router.push(`/app/miembros/${m.id}`)} />}
    </>
  );
}

function FamiliesTab() {
  const editor = can.editMembers(useSession().me);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['families'], queryFn: () => api<Family[]>('/families') });
  const [editing, setEditing] = useState<Family | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Family | null>(null);
  const [q, setQ] = useState('');
  const save = useAction(
    ({ id, name }: { id?: string; name: string }) => (id ? api(`/families/${id}`, { method: 'PATCH', body: { name } }) : api('/families', { method: 'POST', body: { name } })),
    { success: 'Familia guardada', invalidate: [['families']], onSuccess: () => setEditing(null) },
  );
  const remove = useAction((id: string) => api(`/families/${id}`, { method: 'DELETE' }), {
    success: 'Familia eliminada',
    invalidate: [['families'], ['members']],
    onSuccess: () => setDeleting(null),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const list = data.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Card>
      <div className="flex gap-3 border-b border-border p-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar familia" aria-label="Buscar familia" />
        {editor && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Nueva
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <EmptyState title="No hay familias" description="Agrupa a los miembros por familia desde aquí o desde su ficha." />
      ) : (
        <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
          {list.map((f) => (
            <li key={f.id} className="flex items-start gap-3 border-border px-5 py-4 sm:border-b sm:odd:border-r">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{f.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {f.members.length === 0
                    ? 'Sin integrantes'
                    : f.members.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 && ', '}
                          <Link href={`/app/miembros/${m.id}`} className="hover:text-accent-ink hover:underline">
                            {m.firstName}
                          </Link>
                        </span>
                      ))}
                </p>
              </div>
              {editor && (
                <ActionMenu
                  items={[
                    { label: 'Renombrar', icon: Pencil, onClick: () => setEditing(f) },
                    { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(f) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <NameDialog
          title={editing === 'new' ? 'Nueva familia' : 'Renombrar familia'}
          initial={editing === 'new' ? '' : editing.name}
          loading={save.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(name) => save.mutate({ id: editing === 'new' ? undefined : editing.id, name })}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar familia"
        message="Los integrantes no se eliminan, solo quedan sin familia asignada."
        confirmLabel="Eliminar"
      />
    </Card>
  );
}

function NameDialog({ title, initial, onClose, onSubmit, loading }: { title: string; initial: string; onClose: () => void; onSubmit: (v: string) => void; loading: boolean }) {
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="name-form" loading={loading}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(String(new FormData(e.currentTarget).get('name')));
        }}
      >
        <Field label="Nombre">
          <Input name="name" required minLength={2} defaultValue={initial} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}

function MinistriesTab() {
  const { me } = useSession();
  // Los ministerios son comunes a todas las sedes: solo los cambia quien gestiona toda la iglesia.
  const editor = can.editMembers(me) && me.campusScope === null;
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['ministries'], queryFn: () => api<Ministry[]>('/ministries') });
  const [editing, setEditing] = useState<Ministry | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Ministry | null>(null);
  const remove = useAction((id: string) => api(`/ministries/${id}`, { method: 'DELETE' }), {
    success: 'Ministerio eliminado',
    invalidate: [['ministries'], ['members']],
    onSuccess: () => setDeleting(null),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      {editor && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Nuevo ministerio
          </Button>
        </div>
      )}
      {data.length === 0 ? (
        <Card>
          <EmptyState title="No hay ministerios" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((m) => (
            <Card key={m.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{m.name}</h3>
                {editor && (
                  <ActionMenu
                    items={[
                      { label: 'Editar', icon: Pencil, onClick: () => setEditing(m) },
                      { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(m) },
                    ]}
                  />
                )}
              </div>
              {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
              <div className="mt-auto flex items-center justify-between pt-4 text-sm">
                <span className="text-muted">{m.leader ? `Líder: ${fullName(m.leader)}` : 'Sin líder asignado'}</span>
                <Badge tone="accent">{m._count.members} integrantes</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <MinistryForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar ministerio"
        message={`¿Eliminar "${deleting?.name}"? Los miembros no se eliminan.`}
        confirmLabel="Eliminar"
      />
    </>
  );
}

function MinistryForm({ item, onClose }: { item: Ministry | null; onClose: () => void }) {
  const { data: members } = useQuery({
    queryKey: ['members', 'leaders'],
    queryFn: () => api<Paged<Member>>('/members', { query: { pageSize: 200 } }),
  });
  const save = useAction(
    (body: Record<string, unknown>) => (item ? api(`/ministries/${item.id}`, { method: 'PATCH', body }) : api('/ministries', { method: 'POST', body })),
    { success: 'Ministerio guardado', invalidate: [['ministries']], onSuccess: onClose },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Editar ministerio' : 'Nuevo ministerio'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="ministry-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="ministry-form"
        className="flex flex-col gap-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          save.mutate(formValues(e.currentTarget));
        }}
      >
        <Field label="Nombre">
          <Input name="name" required minLength={2} defaultValue={item?.name} />
        </Field>
        <Field label="Descripción">
          <Textarea name="description" rows={3} defaultValue={item?.description ?? ''} />
        </Field>
        <Field label="Líder">
          <Select name="leaderId" defaultValue={item?.leaderId ?? ''} key={members?.items.length}>
            <option value="">Sin líder</option>
            {members?.items.map((m) => (
              <option key={m.id} value={m.id}>
                {m.lastName}, {m.firstName}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}

function StatusesTab() {
  const editor = can.manageMemberStatuses(useSession().me);
  const { data, isLoading, error, refetch } = useMemberStatuses();
  const [editing, setEditing] = useState<MemberStatus | 'new' | null>(null);
  const [deleting, setDeleting] = useState<MemberStatus | null>(null);
  const invalidate = [['member-statuses'], ['members']];
  const reorder = useAction((ids: string[]) => api('/member-statuses/order', { method: 'PUT', body: { ids } }), { invalidate });
  const remove = useAction((id: string) => api(`/member-statuses/${id}`, { method: 'DELETE' }), {
    success: 'Estado eliminado',
    invalidate,
    onSuccess: () => setDeleting(null),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  function move(index: number, delta: number) {
    const ids = data!.map((s) => s.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    reorder.mutate(ids);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Cada persona puede tener varios estados. El orden se usa en filtros y etiquetas.</p>
        {editor && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="size-4" /> Nuevo estado
          </Button>
        )}
      </div>
      <Card>
        {data.length === 0 ? (
          <EmptyState title="No hay estados" description="Crea estados como Visitante, Miembro o Bautizado para clasificar a los miembros." />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={s} />
                    {s.isDefault && <Badge tone="accent">Al crear cuenta</Badge>}
                    {s.inactive && <Badge>No cuenta como activo</Badge>}
                  </div>
                  {s.description && <p className="mt-1 text-sm text-muted">{s.description}</p>}
                </div>
                <span className="shrink-0 text-sm text-muted tabular-nums">{s._count.members === 1 ? '1 persona' : `${number(s._count.members)} personas`}</span>
                {editor && (
                  <div className="flex shrink-0 items-center">
                    <Button size="sm" variant="ghost" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} aria-label={`Subir ${s.name}`}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={i === data.length - 1 || reorder.isPending} onClick={() => move(i, 1)} aria-label={`Bajar ${s.name}`}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <ActionMenu
                      items={[
                        { label: 'Editar', icon: Pencil, onClick: () => setEditing(s) },
                        { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(s) },
                      ]}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <StatusForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="Eliminar estado"
        message={
          deleting && deleting._count.members > 0
            ? `Se quita "${deleting.name}" de ${deleting._count.members === 1 ? '1 persona' : `${deleting._count.members} personas`}. Sus fichas no se borran. ¿Continuar?`
            : `¿Eliminar el estado "${deleting?.name}"?`
        }
        confirmLabel="Eliminar"
        danger
        loading={remove.isPending}
      />
    </>
  );
}

function StatusForm({ item, onClose }: { item: MemberStatus | null; onClose: () => void }) {
  const save = useAction(
    (body: Record<string, unknown>) => (item ? api(`/member-statuses/${item.id}`, { method: 'PATCH', body }) : api('/member-statuses', { method: 'POST', body })),
    { success: 'Estado guardado', invalidate: [['member-statuses'], ['members']], onSuccess: onClose },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Editar estado' : 'Nuevo estado'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="status-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="status-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(formValues(e.currentTarget));
        }}
      >
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <Field label="Nombre">
            <Input name="name" required minLength={2} maxLength={40} defaultValue={item?.name ?? ''} placeholder="Ej.: Líder de célula" />
          </Field>
          <Field label="Color">
            <Input name="color" type="color" defaultValue={item?.color ?? '#64748b'} className="h-10 w-20 p-1" />
          </Field>
        </div>
        <Field label="Descripción">
          <Textarea name="description" rows={2} maxLength={200} defaultValue={item?.description ?? ''} placeholder="Opcional" />
        </Field>
        <Checkbox
          name="isDefault"
          defaultChecked={item?.isDefault ?? false}
          label={
            <>
              <span className="font-medium">Asignar al crear cuenta</span>
              <span className="block text-xs text-muted">Se agrega a quienes se registran en la app o reciben un usuario nuevo.</span>
            </>
          }
        />
        <Checkbox
          name="inactive"
          defaultChecked={item?.inactive ?? false}
          label={
            <>
              <span className="font-medium">No cuenta como activo</span>
              <span className="block text-xs text-muted">Quienes lo tengan no se cuentan en el total de miembros del inicio.</span>
            </>
          }
        />
      </form>
    </Dialog>
  );
}
