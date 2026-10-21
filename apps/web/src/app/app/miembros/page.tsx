'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { MemberForm } from '@/components/member-form';
import { ActionMenu } from '@/components/menu';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Pagination, Select, Stat, Tabs, Textarea, td, th } from '@/components/ui';
import { api, download } from '@/lib/api';
import { fullName, MEMBER_STATUS_LABEL, number } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import type { Family, Member, MemberStatus, Ministry, Paged } from '@/lib/types';

const STATUS_TONE: Record<MemberStatus, 'neutral' | 'accent' | 'success' | 'warning'> = {
  VISITOR: 'warning',
  ATTENDEE: 'neutral',
  MEMBER: 'accent',
  BAPTIZED: 'success',
  INACTIVE: 'neutral',
};

type Tab = 'members' | 'families' | 'ministries';

export default function MembersPage() {
  const [tab, setTab] = useState<Tab>('members');
  return (
    <>
      <PageHeader title="Miembros" description="Padrón de la congregación, familias y ministerios." />
      <div className="mb-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'members', label: 'Padrón' },
            { value: 'families', label: 'Familias' },
            { value: 'ministries', label: 'Ministerios' },
          ]}
        />
      </div>
      {tab === 'members' && <MembersTab />}
      {tab === 'families' && <FamiliesTab />}
      {tab === 'ministries' && <MinistriesTab />}
    </>
  );
}

function MembersTab() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [status, setStatus] = useState('');
  const [ministryId, setMinistryId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filters = { q: query, status, ministryId };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['members', filters, page],
    queryFn: () => api<Paged<Member>>('/members', { query: { ...filters, page, pageSize: 25 } }),
    placeholderData: (prev) => prev,
  });
  const { data: stats } = useQuery({
    queryKey: ['members', 'stats'],
    queryFn: () => api<{ total: number; newThisMonth: number; byStatus: Record<MemberStatus, number> }>('/members/stats'),
  });
  const { data: ministries = [] } = useQuery({ queryKey: ['ministries'], queryFn: () => api<Ministry[]>('/ministries') });

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
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total en padrón" value={number(stats.total)} />
          <Stat label="Bautizados" value={number(stats.byStatus.BAPTIZED)} />
          <Stat label="Miembros" value={number(stats.byStatus.MEMBER)} />
          <Stat label="Visitantes y asistentes" value={number(stats.byStatus.VISITOR + stats.byStatus.ATTENDEE)} hint={`${stats.newThisMonth} nuevos este mes`} />
        </div>
      )}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
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
          <div className="grid grid-cols-2 gap-3 lg:flex">
            <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Estado" className="lg:w-40">
              <option value="">Todos los estados</option>
              {(Object.keys(MEMBER_STATUS_LABEL) as MemberStatus[]).map((s) => (
                <option key={s} value={s}>
                  {MEMBER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select value={ministryId} onChange={(e) => (setMinistryId(e.target.value), setPage(1))} aria-label="Ministerio" className="lg:w-44">
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
            <Button onClick={() => setCreating(true)} className="flex-1">
              <Plus className="size-4" /> Agregar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No se encontraron miembros" description="Probá con otros filtros o agregá un miembro nuevo." />
        ) : (
          <>
            {/* Tabla escritorio */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="border-b border-border bg-surface-2/50">
                  <tr>
                    <th className={th}>Nombre</th>
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
                            {m.user && <p className="text-xs text-muted">Con cuenta en Kahal</p>}
                          </div>
                        </div>
                      </td>
                      <td className={td}>
                        <Badge tone={STATUS_TONE[m.status]}>{MEMBER_STATUS_LABEL[m.status]}</Badge>
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
                      <p className="truncate text-xs text-muted">{m.phone ?? m.email ?? '—'}</p>
                    </div>
                    <Badge tone={STATUS_TONE[m.status]}>{MEMBER_STATUS_LABEL[m.status]}</Badge>
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
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Nueva
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No hay familias" description="Agrupá a los miembros por familia desde aquí o desde su ficha." />
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
              <ActionMenu
                items={[
                  { label: 'Renombrar', icon: Pencil, onClick: () => setEditing(f) },
                  { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(f) },
                ]}
              />
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
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Nuevo ministerio
        </Button>
      </div>
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
                <ActionMenu
                  items={[
                    { label: 'Editar', icon: Pencil, onClick: () => setEditing(m) },
                    { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(m) },
                  ]}
                />
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
