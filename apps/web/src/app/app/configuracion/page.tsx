'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Copy, Pencil, Plus, QrCode as QrIcon, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ChurchQrDialog, QrCode, registerLink } from '@/components/church-qr';
import { CurrencyOptions } from '@/components/currency-options';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { ImageUpload } from '@/components/image-upload';
import { ActionMenu } from '@/components/menu';
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Pagination, Select, Tabs, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { dayLabel, fullName, USER_STATUS_LABEL } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import { STREAM_CHANNELS } from '@/lib/embed';
import { can, PERMISSION_GROUPS, PERMISSION_IMPLIES } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Church, ChurchRole, Me, Paged, Permission, UserRow } from '@/lib/types';

type Tab = 'church' | 'users' | 'roles';

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.value));
const PERMISSION_LABEL = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.value, i.label]))) as Record<Permission, string>;

/** Invalida todo lo que depende de roles y permisos (incluidos los propios). */
const ROLE_QUERIES = [['roles'], ['users'], ['me'], ['hosts']];

const rolePermissions = (r: Pick<ChurchRole, 'isAdmin' | 'permissions'>) => (r.isAdmin ? ALL_PERMISSIONS : r.permissions);

/** Solo se puede asignar o modificar lo que no da más permisos que los propios. */
const covers = (me: Me, perms: Permission[]) => me.isSuperAdmin || perms.every((p) => me.permissions.includes(p));

export default function SettingsPage() {
  const { me } = useSession();
  const tabs = [
    ...(can.churchSettings(me) ? [{ value: 'church' as Tab, label: 'Iglesia' }] : []),
    ...(can.viewUsers(me) ? [{ value: 'users' as Tab, label: 'Usuarios' }] : []),
    ...(can.viewUsers(me) || can.manageRoles(me) ? [{ value: 'roles' as Tab, label: 'Roles y permisos' }] : []),
  ];
  const [tab, setTab] = useState<Tab | undefined>(tabs[0]?.value);

  if (!tab) return <ErrorState error={new Error('No tenés permisos para acceder a la configuración')} />;
  return (
    <>
      <PageHeader title="Configuración" description="Datos de la iglesia, usuarios, roles y permisos." />
      {tabs.length > 1 && (
        <div className="mb-6">
          <Tabs value={tab} onChange={setTab} items={tabs} />
        </div>
      )}
      {tab === 'church' ? <ChurchSettings /> : tab === 'users' ? <UsersSettings /> : <RolesSettings />}
    </>
  );
}

function ChurchSettings() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useSession();
  const [showQr, setShowQr] = useState(false);
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
  const registerUrl = registerLink(data.slug);
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
            <Input name="primaryColor" type="color" defaultValue={data.primaryColor ?? '#8b5cf6'} className="h-10 w-20 p-1" />
          </Field>
          <Field label="Moneda principal">
            <Select name="defaultCurrency" defaultValue={data.defaultCurrency}>
              <CurrencyOptions />
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
          <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-semibold">Canales de transmisión</legend>
            {STREAM_CHANNELS.map((c) => (
              <Field key={c.key} label={c.label}>
                <Input name={c.key} type="url" pattern="https://.*" defaultValue={data[c.key] ?? ''} placeholder={c.placeholder} />
              </Field>
            ))}
            <p className="-mt-2 text-xs text-muted sm:col-span-3">Aparecen en la página pública y en “En vivo”, y se pueden elegir al crear una transmisión.</p>
          </fieldset>
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
      <div className="space-y-6">
        <Card>
          <CardHeader title="Código QR de registro" description="Fijo para la iglesia: imprimilo y quien lo escanee se registra directamente acá." />
          <div className="flex flex-col items-center gap-4 p-5">
            <QrCode value={registerUrl} className="w-40 rounded-lg border border-border bg-white p-1.5" />
            <Button variant="secondary" onClick={() => setShowQr(true)}>
              <QrIcon className="size-4" /> Descargar o imprimir
            </Button>
          </div>
        </Card>
        <Card>
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
      {showQr && <ChurchQrDialog church={data} onClose={() => setShowQr(false)} />}
    </div>
  );
}

function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api<ChurchRole[]>('/roles') });
}

function UsersSettings() {
  const { me } = useSession();
  const manage = can.manageUsers(me);
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [roleId, setRoleId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const { data: roles = [] } = useRoles();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', { query, roleId, page }],
    queryFn: () => api<Paged<UserRow>>('/users', { query: { q: query, roleId, page, pageSize: 25 } }),
    placeholderData: (p) => p,
  });
  const update = useAction(({ id, ...body }: { id: string; status: string }) => api(`/users/${id}`, { method: 'PATCH', body }), {
    success: 'Usuario actualizado',
    invalidate: [['users'], ['hosts']],
  });

  /** Permisos efectivos de un usuario según los roles que tiene. */
  const userPermissions = (u: UserRow) => {
    const own = roles.filter((r) => u.roles.some((ur) => ur.role.id === r.id));
    return [...new Set(own.flatMap(rolePermissions))];
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Buscar usuario" className="pl-9" aria-label="Buscar usuario" />
        </div>
        <Select value={roleId} onChange={(e) => (setRoleId(e.target.value), setPage(1))} className="sm:w-48" aria-label="Rol">
          <option value="">Todos los roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        {manage && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo usuario
          </Button>
        )}
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
              const editable = manage && !self && (u.status === 'ACTIVE' || u.status === 'DISABLED') && covers(me, userPermissions(u));
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    {u.status !== 'ACTIVE' && <Badge tone={u.status === 'PENDING' ? 'warning' : 'neutral'}>{USER_STATUS_LABEL[u.status]}</Badge>}
                    {u.roles.length === 0 ? (
                      <Badge>Miembro</Badge>
                    ) : (
                      u.roles.map((r) => (
                        <Badge key={r.role.id} tone="accent">
                          {r.role.name}
                        </Badge>
                      ))
                    )}
                    {editable && (
                      <ActionMenu
                        items={[
                          { label: 'Editar roles', icon: ShieldCheck, onClick: () => setEditing(u) },
                          {
                            label: u.status === 'ACTIVE' ? 'Deshabilitar' : 'Habilitar',
                            icon: Ban,
                            danger: u.status === 'ACTIVE',
                            onClick: () => update.mutate({ id: u.id, status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
                          },
                        ]}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={25} total={data.total} onChange={setPage} />
        </>
      )}
      <p className="border-t border-border bg-surface-2/40 px-5 py-3 text-xs text-muted">
        Un usuario puede tener varios roles: sus permisos son la suma de todos. Sin roles, accede a novedades, eventos, artículos, en vivo y citas.
      </p>
      {creating && <CreateUser roles={roles} onClose={() => setCreating(false)} />}
      {editing && <EditUserRoles user={editing} roles={roles} onClose={() => setEditing(null)} />}
    </Card>
  );
}

/** Casillas de roles; deshabilita los que darían más permisos que los propios. */
function RolePicker({ roles, selected, onChange }: { roles: ChurchRole[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const { me } = useSession();
  if (roles.length === 0) return <p className="text-sm text-muted">Todavía no hay roles creados.</p>;
  return (
    <div className="grid gap-2.5">
      {roles.map((r) => {
        const allowed = covers(me, rolePermissions(r));
        return (
          <Checkbox
            key={r.id}
            checked={selected.includes(r.id)}
            disabled={!allowed}
            onChange={(e) => onChange(e.target.checked ? [...selected, r.id] : selected.filter((id) => id !== r.id))}
            label={
              <>
                <span className="font-medium">{r.name}</span>
                {r.description && <span className="block text-xs text-muted">{r.description}</span>}
                {!allowed && <span className="block text-xs text-muted">Tiene permisos que vos no tenés</span>}
              </>
            }
          />
        );
      })}
    </div>
  );
}

function EditUserRoles({ user, roles, onClose }: { user: UserRow; roles: ChurchRole[]; onClose: () => void }) {
  const [selected, setSelected] = useState(() => user.roles.map((r) => r.role.id));
  const save = useAction(() => api(`/users/${user.id}`, { method: 'PATCH', body: { roleIds: selected } }), {
    success: 'Roles actualizados',
    invalidate: ROLE_QUERIES,
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Roles de ${fullName(user)}`}
      description="Los cambios aplican de inmediato."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <RolePicker roles={roles} selected={selected} onChange={setSelected} />
    </Dialog>
  );
}

function CreateUser({ roles, onClose }: { roles: ChurchRole[]; onClose: () => void }) {
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const save = useAction((body: Record<string, unknown>) => api('/users', { method: 'POST', body }), {
    success: 'Usuario creado',
    invalidate: [['users'], ['members'], ['hosts'], ['roles']],
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
          save.mutate({ ...formValues(e.currentTarget), roleIds });
        }}
      >
        <Field label="Nombre">
          <Input name="firstName" required minLength={2} />
        </Field>
        <Field label="Apellido">
          <Input name="lastName" required minLength={2} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required />
        </Field>
        <Field label="Contraseña inicial">
          <Input name="password" type="text" required minLength={8} autoComplete="off" />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Roles</legend>
          <RolePicker roles={roles} selected={roleIds} onChange={setRoleIds} />
        </fieldset>
      </form>
    </Dialog>
  );
}

function RolesSettings() {
  const { me } = useSession();
  const manage = can.manageRoles(me);
  const { data, isLoading, error, refetch } = useRoles();
  const [editing, setEditing] = useState<ChurchRole | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ChurchRole | null>(null);
  const remove = useAction((id: string) => api(`/roles/${id}`, { method: 'DELETE' }), {
    success: 'Rol eliminado',
    invalidate: ROLE_QUERIES,
    onSuccess: () => setDeleting(null),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Armá los roles de tu iglesia y elegí qué puede hacer cada uno. Después asignalos desde la pestaña Usuarios.</p>
        {manage && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="size-4" /> Nuevo rol
          </Button>
        )}
      </div>
      {data.length === 0 ? (
        <Card>
          <EmptyState title="No hay roles" description="Creá el primer rol para empezar a delegar tareas." />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((r) => {
            const editable = manage && covers(me, rolePermissions(r));
            return (
              <Card key={r.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 font-semibold">
                      {r.name}
                      {r.isAdmin && <Badge tone="accent">Acceso total</Badge>}
                    </h3>
                    {r.description && <p className="mt-0.5 text-sm text-muted">{r.description}</p>}
                  </div>
                  {editable && (
                    <ActionMenu
                      items={[
                        { label: 'Editar', icon: Pencil, onClick: () => setEditing(r) },
                        ...(r.isAdmin ? [] : [{ label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(r) }]),
                      ]}
                    />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.isAdmin ? (
                    <span className="text-sm text-muted">Todos los permisos, incluidos los que se agreguen en el futuro.</span>
                  ) : r.permissions.length === 0 ? (
                    <span className="text-sm text-muted">Sin permisos adicionales.</span>
                  ) : (
                    r.permissions.map((p) => <Badge key={p}>{PERMISSION_LABEL[p]}</Badge>)
                  )}
                </div>
                <p className="mt-auto pt-4 text-xs text-muted">
                  {r._count.users === 1 ? '1 usuario' : `${r._count.users} usuarios`}
                </p>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <RoleForm role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="Eliminar rol"
        message={
          deleting && deleting._count.users > 0
            ? `${deleting._count.users === 1 ? '1 usuario pierde' : `${deleting._count.users} usuarios pierden`} los permisos de "${deleting.name}". ¿Continuar?`
            : `¿Eliminar el rol "${deleting?.name}"?`
        }
        confirmLabel="Eliminar"
        danger
        loading={remove.isPending}
      />
    </>
  );
}

function RoleForm({ role, onClose }: { role: ChurchRole | null; onClose: () => void }) {
  const { me } = useSession();
  const [perms, setPerms] = useState<Permission[]>(role?.permissions ?? []);
  const save = useAction(
    (body: Record<string, unknown>) => (role ? api(`/roles/${role.id}`, { method: 'PATCH', body }) : api('/roles', { method: 'POST', body })),
    { success: 'Rol guardado', invalidate: ROLE_QUERIES, onSuccess: onClose },
  );

  // Marcar un permiso suma los que necesita; desmarcar uno quita los que dependen de él.
  function toggle(p: Permission, on: boolean) {
    setPerms((cur) => {
      const next = new Set(cur);
      if (on) {
        next.add(p);
        PERMISSION_IMPLIES[p]?.forEach((dep) => next.add(dep));
      } else {
        next.delete(p);
        for (const [k, deps] of Object.entries(PERMISSION_IMPLIES)) if (deps.includes(p)) next.delete(k as Permission);
      }
      return ALL_PERMISSIONS.filter((x) => next.has(x));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={role ? `Editar rol "${role.name}"` : 'Nuevo rol'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="role-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="role-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          save.mutate({ name: v.name, description: v.description, permissions: perms });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <Input name="name" required minLength={2} maxLength={40} defaultValue={role?.name ?? ''} placeholder="Ej.: Coordinador de jóvenes" />
          </Field>
          <Field label="Descripción">
            <Input name="description" maxLength={200} defaultValue={role?.description ?? ''} placeholder="Opcional" />
          </Field>
        </div>
        {role?.isAdmin ? (
          <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">
            Este es el rol de administración de la iglesia: tiene todos los permisos y no se puede eliminar.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {PERMISSION_GROUPS.map((g) => (
              <fieldset key={g.label}>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{g.label}</legend>
                <div className="grid gap-2.5">
                  {g.items.map((it) => {
                    const mine = covers(me, [it.value]);
                    return (
                      <Checkbox
                        key={it.value}
                        checked={perms.includes(it.value)}
                        disabled={!mine}
                        onChange={(e) => toggle(it.value, e.target.checked)}
                        label={
                          <>
                            <span className="font-medium">{it.label}</span>
                            <span className="block text-xs text-muted">{mine ? it.help : 'No podés otorgar un permiso que no tenés'}</span>
                          </>
                        }
                      />
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </form>
    </Dialog>
  );
}
