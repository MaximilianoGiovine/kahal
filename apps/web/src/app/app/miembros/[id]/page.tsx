'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Cake, Church, Droplets, IdCard, Mail, MapPin, Pencil, Phone, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/dialog';
import { MemberForm } from '@/components/member-form';
import { StatusBadges } from '@/components/member-statuses';
import { Avatar, Badge, Button, Card, CardHeader, ErrorState, Loading, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { dayLabel, fullName, money, roleNames } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { MemberDetail } from '@/lib/types';

function age(iso: string) {
  const b = new Date(iso);
  const n = new Date();
  let a = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useSession();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: m, isLoading, error, refetch } = useQuery({ queryKey: ['member', id], queryFn: () => api<MemberDetail>(`/members/${id}`) });
  const remove = useAction(() => api(`/members/${id}`, { method: 'DELETE' }), {
    success: 'Miembro eliminado',
    invalidate: [['members']],
    onSuccess: () => router.replace('/app/miembros'),
  });

  if (isLoading) return <Loading />;
  if (error || !m) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <Link href="/app/miembros" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Miembros
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={m} size={64} />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{fullName(m)}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadges statuses={m.statuses} empty="Sin estado" />
            {m.user && <Badge>{roleNames(m.user)}</Badge>}
            {m.family && <span className="text-sm text-muted">{m.family.name}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {can.deleteMember(me) && !m.user && (
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" /> Eliminar
            </Button>
          )}
          {can.editMembers(me) && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Editar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Datos personales" />
          <dl className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
            {m.campus && <Item icon={<Church />} label="Sede" value={m.campus.name} />}
            <Item icon={<Mail />} label="Email" value={m.email} />
            <Item icon={<Phone />} label="Teléfono" value={m.phone} />
            <Item icon={<IdCard />} label="Número de documento" value={m.documentId} />
            <Item icon={<Cake />} label="Nacimiento" value={m.birthDate && `${dayLabel(m.birthDate, 'long')} (${age(m.birthDate)} años)`} />
            <Item icon={<MapPin />} label="Dirección" value={m.address} />
            <Item icon={<UserPlus />} label="Ingreso a la iglesia" value={m.joinedAt && dayLabel(m.joinedAt, 'long')} />
            <Item
              icon={<Droplets />}
              label="Bautismo"
              value={m.baptismDate ? dayLabel(m.baptismDate, 'long') : m.baptized === true ? 'Bautizado/a' : m.baptized === false ? 'No bautizado/a' : null}
            />
          </dl>
          {m.notes && (
            <div className="border-t border-border p-5">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Notas</p>
              <p className="mt-1.5 text-sm whitespace-pre-line">{m.notes}</p>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Ministerios" />
            <div className="flex flex-wrap gap-2 p-5">
              {m.ministries?.length ? m.ministries.map((x) => <Badge key={x.ministry.id} tone="accent">{x.ministry.name}</Badge>) : <p className="text-sm text-muted">No participa en ministerios.</p>}
            </div>
          </Card>
          {m.family && (
            <Card>
              <CardHeader title={m.family.name} />
              <ul className="divide-y divide-border">
                {m.family.members.map((f) => (
                  <li key={f.id}>
                    <Link href={`/app/miembros/${f.id}`} className={`flex items-center justify-between px-5 py-2.5 text-sm hover:bg-surface-2 ${f.id === m.id ? 'font-medium' : ''}`}>
                      {fullName(f)}
                      <span className="text-xs text-muted">{f.familyRole}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {m.user && (
            <Card className="p-5 text-sm">
              <p className="font-medium">Cuenta en Kahal</p>
              <p className="mt-1 text-muted">{m.user.email}</p>
              <p className="mt-1 text-xs text-subtle">Último ingreso: {m.user.lastLoginAt ? dayLabel(m.user.lastLoginAt) : 'nunca'}</p>
            </Card>
          )}
        </div>
      </div>

      {m.giving && (
        <Card className="mt-6">
          <CardHeader title="Aportes registrados" description="Últimos 20 movimientos asociados a este miembro." />
          {m.giving.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Sin aportes registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Fecha</th>
                    <th className={th}>Categoría</th>
                    <th className={`${th} text-right`}>Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {m.giving.map((g) => (
                    <tr key={g.id}>
                      <td className={`${td} tabular`}>{dayLabel(g.date, 'short')}</td>
                      <td className={td}>{g.category.name}</td>
                      <td className={`${td} tabular text-right font-medium`}>{money(g.amount, g.account.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && <MemberForm member={m} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        danger
        title="Eliminar miembro"
        message={`¿Eliminar a ${fullName(m)} del registro? Si prefieres conservar el historial, márcalo como "Inactivo".`}
        confirmLabel="Eliminar"
      />
    </>
  );
}

function Item({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-subtle [&>svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="mt-0.5 text-sm break-words">{value || '—'}</dd>
      </div>
    </div>
  );
}
