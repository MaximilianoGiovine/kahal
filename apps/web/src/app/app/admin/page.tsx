'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Dialog } from '@/components/dialog';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, PageHeader, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { dayLabel, number } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Church } from '@/lib/types';

type AdminChurch = Church & { createdAt: string; _count: { members: number; users: number } };

export default function AdminChurchesPage() {
  const { isSuperAdmin, selectChurch } = useSession();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'churches'],
    queryFn: () => api<AdminChurch[]>('/admin/churches'),
    enabled: isSuperAdmin,
  });
  const toggle = useAction(({ id, active }: { id: string; active: boolean }) => api(`/admin/churches/${id}`, { method: 'PATCH', body: { active } }), {
    success: 'Iglesia actualizada',
    invalidate: [['admin']],
  });

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;

  return (
    <>
      <PageHeader
        title="Iglesias"
        description="Iglesias que usan Kahal en esta instalación."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nueva iglesia
          </Button>
        }
      />
      <Card>
        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length === 0 ? (
          <EmptyState icon={<Building2 className="size-5" />} title="Todavía no hay iglesias" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Iglesia</th>
                  <th className={th}>Miembros</th>
                  <th className={th}>Usuarios</th>
                  <th className={th}>Alta</th>
                  <th className={th}>Estado</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((c) => (
                  <tr key={c.id}>
                    <td className={td}>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted">
                        /{c.slug}
                        {c.city && ` · ${c.city}`}
                      </p>
                    </td>
                    <td className={`${td} tabular`}>{number(c._count.members)}</td>
                    <td className={`${td} tabular`}>{number(c._count.users)}</td>
                    <td className={`${td} text-muted`}>{dayLabel(c.createdAt)}</td>
                    <td className={td}>
                      <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Activa' : 'Deshabilitada'}</Badge>
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex justify-end gap-2">
                        <Link href={`/i/${c.slug}`} target="_blank" className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Página pública">
                          <ExternalLink className="size-4" />
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: c.id, active: !c.active })}>
                          {c.active ? 'Deshabilitar' : 'Habilitar'}
                        </Button>
                        <Link href="/app" onClick={() => selectChurch(c.id)} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-2">
                          Operar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <CreateChurch onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateChurch({ onClose }: { onClose: () => void }) {
  const [slug, setSlug] = useState('');
  const save = useAction((body: Record<string, unknown>) => api('/admin/churches', { method: 'POST', body }), {
    success: 'Iglesia creada con cuentas y categorías iniciales',
    invalidate: [['admin']],
    onSuccess: onClose,
  });
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^iglesia\s+/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nueva iglesia"
      description="Se crea con categorías y cuentas por defecto y un usuario administrador."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="church-form" loading={save.isPending}>
            Crear iglesia
          </Button>
        </>
      }
    >
      <form
        id="church-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          save.mutate({
            name: v.name,
            slug: v.slug,
            city: v.city || undefined,
            admin: { firstName: v.adminFirstName, lastName: v.adminLastName, email: v.adminEmail, password: v.adminPassword },
          });
        }}
      >
        <Field label="Nombre de la iglesia" className="sm:col-span-2">
          <Input name="name" required minLength={2} onChange={(e) => setSlug(slugify(e.target.value))} />
        </Field>
        <Field label="Identificador (URL)" hint={`/i/${slug || 'mi-iglesia'}`}>
          <Input name="slug" required pattern="^[a-z0-9]+(-[a-z0-9]+)*$" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <Input name="city" />
        </Field>
        <p className="pt-2 text-sm font-semibold sm:col-span-2">Administrador de la iglesia</p>
        <Field label="Nombre">
          <Input name="adminFirstName" required minLength={2} />
        </Field>
        <Field label="Apellido">
          <Input name="adminLastName" required minLength={2} />
        </Field>
        <Field label="Email">
          <Input name="adminEmail" type="email" required />
        </Field>
        <Field label="Contraseña inicial">
          <Input name="adminPassword" type="text" required minLength={8} autoComplete="off" />
        </Field>
      </form>
    </Dialog>
  );
}
