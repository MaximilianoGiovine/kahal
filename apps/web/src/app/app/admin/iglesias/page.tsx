'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, Plus, QrCode, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChurchQrDialog } from '@/components/church-qr';
import { DeleteConfirm } from '@/components/delete-confirm';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Loading, PageHeader, Tabs, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { churchRequestsQuery } from '@/lib/church-requests';
import { dateTime, dayLabel, number } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Church } from '@/lib/types';
import { ChurchRequests } from '../church-requests';
import { CreateChurch } from '../create-church';

type AdminChurch = Church & { createdAt: string; _count: { members: number; users: number } };

export default function AdminChurchesPage() {
  const { isSuperAdmin, selectChurch, me } = useSession();
  const [closing, setClosing] = useState<AdminChurch | null>(null);
  const [creating, setCreating] = useState(false);
  const [qrFor, setQrFor] = useState<AdminChurch | null>(null);
  const [tab, setTab] = useState<'churches' | 'requests'>('churches');
  const [search, setSearch] = useState('');
  // El resumen enlaza directo a las solicitudes con ?tab=solicitudes.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'solicitudes') setTab('requests');
  }, []);
  const { data: requests } = useQuery({ ...churchRequestsQuery, enabled: isSuperAdmin });
  const pending = requests?.filter((r) => r.status === 'PENDING').length ?? 0;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'churches'],
    queryFn: () => api<AdminChurch[]>('/admin/churches'),
    enabled: isSuperAdmin,
  });
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q) || c.city?.toLowerCase().includes(q));
  }, [data, search]);
  const toggle = useAction(({ id, active }: { id: string; active: boolean }) => api(`/admin/churches/${id}`, { method: 'PATCH', body: { active } }), {
    success: 'Iglesia actualizada',
    invalidate: [['admin']],
  });

  const schedule = useAction(({ id, ...body }: { id: string; confirm: string; password?: string }) => api(`/admin/churches/${id}/deletion`, { method: 'POST', body }), {
    success: 'Baja programada',
    invalidate: [['admin']],
    onSuccess: () => setClosing(null),
  });
  const cancelClosing = useAction((id: string) => api(`/admin/churches/${id}/deletion`, { method: 'DELETE' }), { success: 'Baja cancelada', invalidate: [['admin']] });

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;

  return (
    <>
      <PageHeader
        title="Iglesias"
        description="Iglesias que usan Kahal en esta instalación."
        actions={
          tab === 'churches' && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Nueva iglesia
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'churches', label: 'Iglesias' },
            { value: 'requests', label: pending ? `Solicitudes (${pending})` : 'Solicitudes' },
          ]}
        />
        {tab === 'churches' && (
          <div className="relative w-full sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar iglesia" className="pl-9" aria-label="Buscar iglesia" />
          </div>
        )}
      </div>
      {tab === 'requests' ? <ChurchRequests /> : <Card>
        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.length === 0 ? (
          <EmptyState icon={<Building2 className="size-5" />} title="Todavía no hay iglesias" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Search className="size-5" />} title="Ninguna iglesia coincide con la búsqueda" />
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
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className={td}>
                      <Link href={`/app/admin/iglesias/${c.id}`} className="font-medium hover:text-accent-ink hover:underline">
                        {c.name}
                      </Link>
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
                      {c.billingExempt && <Badge className="ml-1">Exenta de pago</Badge>}
                      {c.deletionScheduledFor && <p className="mt-1 text-xs whitespace-nowrap text-danger">Se borra el {dateTime(c.deletionScheduledFor, { dateStyle: 'medium' })}</p>}
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setQrFor(c)} className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Código QR de registro" title="Código QR de registro">
                          <QrCode className="size-4" />
                        </button>
                        <Link href={`/i/${c.slug}`} target="_blank" className="rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Página pública">
                          <ExternalLink className="size-4" />
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: c.id, active: !c.active })}>
                          {c.active ? 'Deshabilitar' : 'Habilitar'}
                        </Button>
                        <Link href={`/app/admin/iglesias/${c.id}`} className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium hover:bg-surface-2">
                          Ficha
                        </Link>
                        {c.deletionScheduledFor ? (
                          <Button size="sm" variant="ghost" onClick={() => cancelClosing.mutate(c.id)}>
                            Cancelar baja
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setClosing(c)}>
                            Dar de baja
                          </Button>
                        )}
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
      </Card>}
      {creating && <CreateChurch onClose={() => setCreating(false)} />}
      {qrFor && <ChurchQrDialog church={qrFor} onClose={() => setQrFor(null)} />}
      {closing && (
        <DeleteConfirm
          title={`Dar de baja ${closing.name}`}
          description="Se avisa a quienes la administran y hay 30 días para cancelar. Después se borran sus usuarios, miembros, finanzas y archivos. Su aval se conserva."
          word={closing.slug}
          askPassword={me.hasPassword}
          confirmLabel="Programar la baja"
          loading={schedule.isPending}
          onClose={() => setClosing(null)}
          onConfirm={(values) => schedule.mutate({ id: closing.id, ...values })}
        />
      )}
    </>
  );
}
