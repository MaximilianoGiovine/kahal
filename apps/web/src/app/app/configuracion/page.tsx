'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Search } from 'lucide-react';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { ImageUpload } from '@/components/image-upload';
import { Avatar, Badge, Button, Card, CardHeader, ErrorState, Field, Input, Loading, PageHeader, Pagination, Select, Tabs, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { dayLabel, fullName, ROLE_LABEL, USER_STATUS_LABEL } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Church, Paged, Role, UserRow } from '@/lib/types';

const ROLES: Role[] = ['ADMIN', 'PASTOR', 'TREASURER', 'SECRETARY', 'MEMBER'];
const ROLE_HELP: Record<string, string> = {
  ADMIN: 'Acceso total a la iglesia',
  PASTOR: 'Miembros, contenido, citas y lectura de finanzas',
  TREASURER: 'Carga y reportes de finanzas',
  SECRETARY: 'Miembros, solicitudes y contenido',
  MEMBER: 'Novedades, en vivo y citas',
};

export default function SettingsPage() {
  const [tab, setTab] = useState<'church' | 'users'>('church');
  return (
    <>
      <PageHeader title="Configuración" description="Datos de la iglesia, usuarios y permisos." />
      <div className="mb-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'church', label: 'Iglesia' },
            { value: 'users', label: 'Usuarios y roles' },
          ]}
        />
      </div>
      {tab === 'church' ? <ChurchSettings /> : <UsersSettings />}
    </>
  );
}

function ChurchSettings() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useSession();
  const { data, isLoading, error } = useQuery({ queryKey: ['church'], queryFn: () => api<Church>('/church') });
  const save = useAction((body: Record<string, unknown>) => api<Church>('/church', { method: 'PATCH', body }), {
    success: 'Datos guardados',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['church'] });
      qc.invalidateQueries({ queryKey: [isSuperAdmin ? 'admin' : 'me'] });
    },
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} />;

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/i/${data.slug}` : '';
  const registerUrl = typeof window !== 'undefined' ? `${window.location.origin}/registro?iglesia=${data.slug}` : '';
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success('Link copiado'));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    if (!v.logoKey) delete v.logoKey;
    if (!v.email) delete v.email;
    save.mutate(v);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Datos de la iglesia" />
        <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <Input name="name" required defaultValue={data.name} />
          </Field>
          <Field label="Descripción" className="sm:col-span-2" hint="Se muestra en la página pública.">
            <Textarea name="description" rows={3} defaultValue={data.description ?? ''} />
          </Field>
          <Field label="Ciudad">
            <Input name="city" defaultValue={data.city ?? ''} />
          </Field>
          <Field label="Dirección">
            <Input name="address" defaultValue={data.address ?? ''} />
          </Field>
          <Field label="Teléfono">
            <Input name="phone" defaultValue={data.phone ?? ''} />
          </Field>
          <Field label="Email de contacto">
            <Input name="email" type="email" defaultValue={data.email ?? ''} />
          </Field>
          <Field label="Color principal">
            <Input name="primaryColor" type="color" defaultValue={data.primaryColor ?? '#4f46e5'} className="h-10 w-20 p-1" />
          </Field>
          <Field label="Moneda principal">
            <Select name="defaultCurrency" defaultValue={data.defaultCurrency}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
          <Field label="Zona horaria" className="sm:col-span-2">
            <Select name="timezone" defaultValue={data.timezone}>
              {['America/Argentina/Buenos_Aires', 'America/Montevideo', 'America/Santiago', 'America/Asuncion', 'America/La_Paz', 'America/Lima', 'America/Bogota', 'America/Mexico_City', 'Europe/Madrid'].map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <ImageUpload name="logoKey" kind="logo" label="Logo" defaultKey={data.logoKey} />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Links para compartir" />
        <div className="space-y-4 p-5">
          {[
            { label: 'Página pública', url: publicUrl },
            { label: 'Registro de miembros', url: registerUrl },
          ].map((l) => (
            <div key={l.label}>
              <p className="text-sm font-medium">{l.label}</p>
              <div className="mt-1.5 flex gap-2">
                <Input readOnly value={l.url} className="text-xs" onFocus={(e) => e.target.select()} />
                <Button variant="secondary" onClick={() => copy(l.url)} aria-label={`Copiar ${l.label}`}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function UsersSettings() {
  const { me } = useSession();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', { query, role, page }],
    queryFn: () => api<Paged<UserRow>>('/users', { query: { q: query, role, page, pageSize: 25 } }),
    placeholderData: (p) => p,
  });
  const update = useAction(({ id, ...body }: { id: string; role?: Role; status?: string }) => api(`/users/${id}`, { method: 'PATCH', body }), {
    success: 'Usuario actualizado',
    invalidate: [['users'], ['hosts']],
  });

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Buscar usuario" className="pl-9" aria-label="Buscar usuario" />
        </div>
        <Select value={role} onChange={(e) => (setRole(e.target.value), setPage(1))} className="sm:w-44" aria-label="Rol">
          <option value="">Todos los roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Nuevo usuario
        </Button>
      </div>
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {data.items.map((u) => {
              const self = u.id === me.id;
              const editable = !self && (u.status === 'ACTIVE' || u.status === 'DISABLED');
              return (
                <li key={u.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={u} size={34} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {fullName(u)} {self && <span className="text-muted">(vos)</span>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {u.email} · último ingreso {u.lastLoginAt ? dayLabel(u.lastLoginAt) : 'nunca'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.status !== 'ACTIVE' && <Badge tone={u.status === 'PENDING' ? 'warning' : 'neutral'}>{USER_STATUS_LABEL[u.status]}</Badge>}
                    <Select
                      value={u.role}
                      disabled={!editable || update.isPending}
                      onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })}
                      className="h-9 w-40"
                      aria-label={`Rol de ${fullName(u)}`}
                      title={ROLE_HELP[u.role]}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                    {editable && (
                      <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: u.id, status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>
                        {u.status === 'ACTIVE' ? 'Deshabilitar' : 'Habilitar'}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={25} total={data.total} onChange={setPage} />
        </>
      )}
      <div className="border-t border-border bg-surface-2/40 px-5 py-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Permisos por rol</p>
        <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="inline font-medium">{ROLE_LABEL[r]}:</dt> <dd className="inline text-muted">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </div>
      {creating && <CreateUser onClose={() => setCreating(false)} />}
    </Card>
  );
}

function CreateUser({ onClose }: { onClose: () => void }) {
  const save = useAction((body: Record<string, unknown>) => api('/users', { method: 'POST', body }), {
    success: 'Usuario creado',
    invalidate: [['users'], ['members'], ['hosts']],
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Nuevo usuario"
      description="La cuenta queda activa de inmediato. Compartí la contraseña inicial con la persona."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" loading={save.isPending}>
            Crear usuario
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(formValues(e.currentTarget));
        }}
      >
        <Field label="Nombre">
          <Input name="firstName" required minLength={2} />
        </Field>
        <Field label="Apellido">
          <Input name="lastName" required minLength={2} />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Rol">
          <Select name="role" defaultValue="PASTOR">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contraseña inicial">
          <Input name="password" type="text" required minLength={8} autoComplete="off" />
        </Field>
      </form>
    </Dialog>
  );
}
