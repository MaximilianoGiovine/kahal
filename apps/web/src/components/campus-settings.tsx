'use client';

import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { ActionMenu } from '@/components/menu';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, ErrorState, Field, Input, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { number } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import type { CampusManage, CampusRow } from '@/lib/types';

/** Todo lo que muestra sedes o depende de a cuál pertenece cada cosa. */
const INVALIDATE = [['campuses'], ['members'], ['member'], ['finance'], ['users'], ['dashboard']];

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${number(n)} ${many}`);

export function CampusSettings() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['campuses', 'manage'], queryFn: () => api<CampusManage>('/campuses/manage') });
  const [editing, setEditing] = useState<CampusRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CampusRow | null>(null);
  const [assigning, setAssigning] = useState<CampusRow | null>(null);

  const toggle = useAction((enabled: boolean) => api('/campuses/settings', { method: 'PUT', body: { enabled } }), {
    success: 'Configuración guardada',
    invalidate: INVALIDATE,
  });
  const archive = useAction(({ id, name, city, address, phone, active }: CampusRow) => api(`/campuses/${id}`, { method: 'PATCH', body: { name, city, address, phone, active: !active } }), {
    success: 'Sede actualizada',
    invalidate: INVALIDATE,
  });
  const remove = useAction((id: string) => api(`/campuses/${id}`, { method: 'DELETE' }), {
    success: 'Sede eliminada',
    invalidate: INVALIDATE,
    onSuccess: () => setDeleting(null),
  });
  const assign = useAction((id: string) => api(`/campuses/${id}/assign-unassigned`, { method: 'POST' }), {
    success: 'Miembros asignados',
    invalidate: INVALIDATE,
    onSuccess: () => setAssigning(null),
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardHeader title="Sedes de la iglesia" description="Para una iglesia con más de un lugar de reunión: separa miembros y finanzas por sede, y limita lo que ve cada responsable." />
        <div className="p-5">
          <Checkbox
            checked={data.enabled}
            disabled={toggle.isPending}
            onChange={(e) => toggle.mutate(e.target.checked)}
            label={
              <>
                <span className="font-medium">Usar sedes en esta iglesia</span>
                <span className="block text-xs text-muted">
                  {data.enabled
                    ? data.restrictedUsers > 0
                      ? `Para desactivarlas, primero quita el límite por sede a ${plural(data.restrictedUsers, 'usuario', 'usuarios')}.`
                      : 'Si las desactivas no se pierde nada: las asignaciones quedan guardadas para cuando vuelvas a activarlas.'
                    : 'Mientras esté apagado, la iglesia funciona como una sola.'}
                </span>
              </>
            }
          />
        </div>
      </Card>

      {data.enabled && (
        <Card>
          <CardHeader
            title="Sedes"
            action={
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus className="size-4" /> Nueva sede
              </Button>
            }
          />
          {data.items.length === 0 ? (
            <EmptyState icon={<MapPin className="size-5" />} title="Todavía no hay sedes" description="Crea la primera y después asígnale miembros y cuentas." />
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((c) => {
                const used = c._count.members + c._count.accounts + c._count.userAccess > 0;
                return (
                  <li key={c.id} className="flex items-start gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {c.name} {!c.active && <Badge className="ml-1">Archivada</Badge>}
                      </p>
                      {(c.city || c.address || c.phone) && <p className="truncate text-sm text-muted">{[c.address, c.city, c.phone].filter(Boolean).join(' · ')}</p>}
                      <p className="mt-1 text-xs text-muted">
                        {plural(c._count.members, 'miembro', 'miembros')} · {plural(c._count.accounts, 'cuenta', 'cuentas')} · {plural(c._count.userAccess, 'responsable', 'responsables')}
                      </p>
                    </div>
                    <ActionMenu
                      items={[
                        { label: 'Editar', icon: Pencil, onClick: () => setEditing(c) },
                        { label: `Asignar miembros sin sede (${number(data.unassignedMembers)})`, icon: Users, hidden: !c.active || data.unassignedMembers === 0, onClick: () => setAssigning(c) },
                        { label: c.active ? 'Archivar' : 'Reactivar', icon: c.active ? Archive : ArchiveRestore, onClick: () => archive.mutate(c) },
                        { label: 'Eliminar', icon: Trash2, danger: true, hidden: used, onClick: () => setDeleting(c) },
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-border bg-surface-2/40 px-5 py-3 text-xs text-muted">
            {plural(data.unassignedMembers, 'miembro sin sede', 'miembros sin sede')}. Las categorías, familias, ministerios y estados son comunes a toda la iglesia. Para separar el dinero, asigna cada cuenta a su sede en Finanzas; a quién limitar se elige en la pestaña Usuarios.
          </p>
        </Card>
      )}

      {editing && <CampusForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar sede"
        message={`¿Eliminar "${deleting?.name}"?`}
        confirmLabel="Eliminar"
      />
      <ConfirmDialog
        open={!!assigning}
        onClose={() => setAssigning(null)}
        onConfirm={() => assigning && assign.mutate(assigning.id)}
        loading={assign.isPending}
        title="Asignar miembros sin sede"
        message={`${plural(data.unassignedMembers, 'miembro sin sede pasa', 'miembros sin sede pasan')} a "${assigning?.name}". Después puedes cambiar a cada persona desde su ficha.`}
        confirmLabel="Asignar"
      />
    </div>
  );
}

function CampusForm({ item, onClose }: { item: CampusRow | null; onClose: () => void }) {
  const save = useAction((body: Record<string, unknown>) => (item ? api(`/campuses/${item.id}`, { method: 'PATCH', body }) : api('/campuses', { method: 'POST', body })), {
    success: 'Sede guardada',
    invalidate: INVALIDATE,
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={item ? 'Editar sede' : 'Nueva sede'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="campus-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="campus-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(formValues(e.currentTarget));
        }}
      >
        <Field label="Nombre">
          <Input name="name" required minLength={2} maxLength={80} defaultValue={item?.name} placeholder="Ej.: Sede Norte" autoFocus />
        </Field>
        <Field label="Ciudad">
          <Input name="city" maxLength={120} defaultValue={item?.city ?? ''} />
        </Field>
        <Field label="Dirección">
          <Input name="address" maxLength={200} defaultValue={item?.address ?? ''} />
        </Field>
        <Field label="Teléfono">
          <Input name="phone" type="tel" maxLength={40} defaultValue={item?.phone ?? ''} />
        </Field>
      </form>
    </Dialog>
  );
}
