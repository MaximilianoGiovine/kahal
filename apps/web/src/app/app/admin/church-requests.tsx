'use client';

import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '@/components/dialog';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { churchRequestsQuery, type ChurchRequest } from '@/lib/church-requests';
import { dayLabel } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const STATUS = {
  PENDING: { label: 'Pendiente', tone: 'warning' },
  APPROVED: { label: 'Aprobada', tone: 'success' },
  REJECTED: { label: 'Rechazada', tone: 'neutral' },
} as const;

export function ChurchRequests() {
  const { data, isLoading, error, refetch } = useQuery(churchRequestsQuery);
  const [approving, setApproving] = useState<ChurchRequest | null>(null);
  const [rejecting, setRejecting] = useState<ChurchRequest | null>(null);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  if (data.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Inbox className="size-5" />} title="No hay solicitudes" description="Las que lleguen desde /solicitar-iglesia van a aparecer acá." />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{r.name}</p>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </div>
              <p className="text-xs text-muted">
                /{r.slug}
                {r.city && ` · ${r.city}`} · {dayLabel(r.createdAt)}
              </p>
            </div>
            {r.status === 'PENDING' && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                  Rechazar
                </Button>
                <Button size="sm" onClick={() => setApproving(r)}>
                  Aprobar
                </Button>
              </div>
            )}
          </div>
          <p className="mt-3 text-sm break-words">
            {r.adminFirstName} {r.adminLastName} · {r.adminEmail} · {r.adminPhone}
          </p>
          {r.message && <p className="mt-2 text-sm break-words whitespace-pre-line text-muted">{r.message}</p>}
          {r.rejectionReason && <p className="mt-2 text-sm break-words text-muted">Motivo del rechazo: {r.rejectionReason}</p>}
        </Card>
      ))}
      {approving && <ApproveDialog request={approving} onClose={() => setApproving(null)} />}
      {rejecting && <RejectDialog request={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}

function ApproveDialog({ request, onClose }: { request: ChurchRequest; onClose: () => void }) {
  const [slug, setSlug] = useState(request.slug);
  const approve = useAction(() => api(`/admin/church-requests/${request.id}/approve`, { method: 'POST', body: { slug } }), {
    success: 'Iglesia creada y solicitud aprobada',
    invalidate: [['admin']],
    onSuccess: onClose,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Aprobar ${request.name}`}
      description={`Se crea la iglesia con sus datos iniciales y ${request.adminFirstName} ${request.adminLastName} queda como pastor.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="approve-request-form" loading={approve.isPending}>
            Aprobar y crear iglesia
          </Button>
        </>
      }
    >
      <form
        id="approve-request-form"
        onSubmit={(e) => {
          e.preventDefault();
          approve.mutate();
        }}
      >
        <Field label="Identificador (URL)" hint={`/i/${slug || request.slug}`}>
          <Input required maxLength={60} pattern="^[a-z0-9]+(-[a-z0-9]+)*$" title="Solo minúsculas, números y guiones" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function RejectDialog({ request, onClose }: { request: ChurchRequest; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const reject = useAction(() => api(`/admin/church-requests/${request.id}/reject`, { method: 'POST', body: { reason: reason || undefined } }), {
    success: 'Solicitud rechazada',
    invalidate: [['admin']],
    onSuccess: onClose,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Rechazar ${request.name}`}
      description={`Le avisamos por email a ${request.adminEmail}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate()}>
            Rechazar solicitud
          </Button>
        </>
      }
    >
      <Field label="Motivo (opcional)" hint="Se incluye en el email.">
        <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Dialog>
  );
}
