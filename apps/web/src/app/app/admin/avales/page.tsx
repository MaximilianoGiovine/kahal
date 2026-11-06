'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSignature, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '@/components/dialog';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, td, th } from '@/components/ui';
import { api, download } from '@/lib/api';
import { dateTime, dayLabel } from '@/lib/format';
import { useSession } from '@/lib/session';

interface AgreementRow {
  id: string;
  churchId: string | null;
  churchName: string;
  churchSlug: string;
  signerFirstName: string;
  signerLastName: string;
  signerEmail: string;
  contractVersion: string;
  acceptedAt: string;
  churchEndedAt: string | null;
  retainUntil: string | null;
}

interface AgreementDetail extends AgreementRow {
  churchCity: string | null;
  timezone: string | null;
  currency: string | null;
  signerPhone: string;
  signerDocument: string;
  signerRole: string;
  contractText: string;
  contractHash: string;
  privacyVersion: string;
  ipAddress: string | null;
  userAgent: string | null;
  recordHash: string;
  intact: boolean;
}

interface Agreements {
  items: AgreementRow[];
  withoutAgreement: { id: string; name: string; slug: string; createdAt: string }[];
}

const utc = (iso: string) => `${dateTime(iso, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' })} UTC`;

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

function AgreementDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'agreements', id],
    queryFn: () => api<AgreementDetail>(`/admin/agreements/${id}`),
  });
  const [downloading, setDownloading] = useState(false);

  async function savePdf() {
    setDownloading(true);
    await download(`/admin/agreements/${id}/pdf`).finally(() => setDownloading(false));
  }

  const rows: [string, string | null | undefined][] = data
    ? [
        ['Iglesia', data.churchName],
        ['Identificador', data.churchSlug],
        ['Ciudad', data.churchCity],
        ['Zona horaria', data.timezone],
        ['Moneda', data.currency],
        ['Firmante', `${data.signerFirstName} ${data.signerLastName}`],
        ['Documento', data.signerDocument],
        ['Cargo', data.signerRole],
        ['Correo', data.signerEmail],
        ['Teléfono', data.signerPhone],
        ['Aceptado', utc(data.acceptedAt)],
        ['Dirección IP', data.ipAddress],
        ['Navegador', data.userAgent],
        ['Versiones', `Contrato ${data.contractVersion} · Política ${data.privacyVersion}`],
        ['Huella del contrato', data.contractHash],
        ['Huella del registro', data.recordHash],
      ]
    : [];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Aval de la iglesia"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {data && (
            <Button loading={downloading} onClick={savePdf}>
              <Download className="size-4" /> Descargar PDF
            </Button>
          )}
        </>
      }
    >
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} />
      ) : (
        <div className="space-y-4">
          {data.intact ? (
            <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" /> Los datos coinciden con la huella guardada al aceptarse.
            </p>
          ) : (
            <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <TriangleAlert className="size-4 shrink-0" /> Los datos no coinciden con la huella: el registro cambió después de aceptarse.
            </p>
          )}
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="break-words">{value || '—'}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-2 text-sm font-medium">Texto aceptado</p>
            <p className="max-h-72 overflow-y-auto rounded-lg border border-border p-3 text-xs leading-relaxed break-words whitespace-pre-line text-muted">{data.contractText}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
