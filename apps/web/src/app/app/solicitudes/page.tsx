'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, UserCheck, X } from 'lucide-react';
import { Avatar, Button, Card, EmptyState, ErrorState, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { fullName, relative } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import type { Paged, UserRow } from '@/lib/types';

export default function RequestsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', 'PENDING'],
    queryFn: () => api<Paged<UserRow>>('/users', { query: { status: 'PENDING', pageSize: 100 } }),
  });
  const inv = [['users'], ['members'], ['dashboard']];
  const approve = useAction((id: string) => api(`/users/${id}/approve`, { method: 'POST' }), { success: 'Solicitud aprobada. Le enviamos un email de bienvenida.', invalidate: inv });
  const reject = useAction((id: string) => api(`/users/${id}/reject`, { method: 'POST' }), { success: 'Solicitud rechazada', invalidate: inv });

  return (
    <>
      <PageHeader title="Solicitudes de registro" description="Personas que se registraron en Kahal y esperan aprobación para acceder." />
      <Card>
        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<UserCheck className="size-5" />} title="No hay solicitudes pendientes" description="Compartí el link de registro de tu iglesia para que los miembros se sumen." />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={u} />
                  <div className="min-w-0">
                    <p className="font-medium">{fullName(u)}</p>
                    <p className="truncate text-sm text-muted">
                      {u.email}
                      {u.phone && ` · ${u.phone}`}
                    </p>
                    <p className="text-xs text-subtle">Solicitado {relative(u.createdAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => reject.mutate(u.id)} disabled={approve.isPending || reject.isPending}>
                    <X className="size-4" /> Rechazar
                  </Button>
                  <Button size="sm" onClick={() => approve.mutate(u.id)} disabled={approve.isPending || reject.isPending}>
                    <Check className="size-4" /> Aprobar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-sm text-muted">
        Al aprobar, la persona queda como <b>Asistente</b> en el padrón (o se vincula a su ficha existente si el email coincide).
      </p>
    </>
  );
}
