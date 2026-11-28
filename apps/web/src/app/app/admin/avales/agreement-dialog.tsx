'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '@/components/dialog';
import { Button, ErrorState, Loading } from '@/components/ui';
import { api, download } from '@/lib/api';
import { dateTime } from '@/lib/format';

export interface AgreementRow {
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

export interface AgreementDetail extends AgreementRow {
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

const utc = (iso: string) => `${dateTime(iso, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' })} UTC`;

export function AgreementDialog({ id, onClose }: { id: string; onClose: () => void }) {
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
