'use client';

import { useQuery } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { dayLabel } from '@/lib/format';
import { useSession } from '@/lib/session';
import { AgreementDialog, type AgreementRow } from './agreement-dialog';

interface Agreements {
  items: AgreementRow[];
  withoutAgreement: { id: string; name: string; slug: string; createdAt: string }[];
}


function StatusBadge({ row }: { row: AgreementRow }) {
  if (row.churchEndedAt) return <Badge>Iglesia eliminada</Badge>;
  return row.churchId ? <Badge tone="success">Vigente</Badge> : <Badge tone="warning">Solicitud en revisión</Badge>;
}

export default function AgreementsPage() {
  const { isSuperAdmin } = useSession();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'agreements'],
    queryFn: () => api<Agreements>('/admin/agreements'),
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;

  return (
    <>
      <PageHeader title="Avales" description="Constancias de los contratos aceptados al solicitar el alta de cada iglesia. No se pueden editar." />
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="space-y-5">
          <Card>
            {data.items.length === 0 ? (
              <EmptyState icon={<FileSignature className="size-5" />} title="Todavía no hay avales" description="Se crean cuando alguien envía el formulario de alta de una iglesia." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={th}>Iglesia</th>
                      <th className={th}>Firmante</th>
                      <th className={th}>Aceptado</th>
                      <th className={th}>Versión</th>
                      <th className={th}>Estado</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((a) => (
                      <tr key={a.id}>
                        <td className={td}>
                          <p className="font-medium">{a.churchName}</p>
                          <p className="text-xs text-muted">/{a.churchSlug}</p>
                        </td>
                        <td className={td}>
                          <p>
                            {a.signerFirstName} {a.signerLastName}
                          </p>
                          <p className="text-xs text-muted">{a.signerEmail}</p>
                        </td>
                        <td className={`${td} whitespace-nowrap text-muted`}>{dayLabel(a.acceptedAt)}</td>
                        <td className={`${td} tabular`}>{a.contractVersion}</td>
                        <td className={td}>
                          <StatusBadge row={a} />
                          {a.retainUntil && <p className="mt-1 text-xs whitespace-nowrap text-muted">Se conserva hasta {dayLabel(a.retainUntil)}</p>}
                        </td>
                        <td className={`${td} text-right`}>
                          <Button size="sm" variant="secondary" onClick={() => setOpenId(a.id)}>
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {data.withoutAgreement.length > 0 && (
            <Card>
              <CardHeader title="Iglesias sin aval" description="Se crearon sin aceptar el contrato: las anteriores a este registro y las dadas de alta por un super admin." />
              <ul className="divide-y divide-border">
                {data.withoutAgreement.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">Alta: {dayLabel(c.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      {openId && <AgreementDialog id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
