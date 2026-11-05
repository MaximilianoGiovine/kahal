'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { Button, ErrorState, Input, Loading, buttonClass } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';

const QUERY_KEY = ['calendar-subscription'];

/** Suscripción al feed .ics personal: los eventos nuevos o editados llegan solos al calendario de la persona. */
export function CalendarSubscribeDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api<{ token: string }>('/calendar/subscription'),
  });
  const rotate = useAction(() => api<{ token: string }>('/calendar/subscription/rotate', { method: 'POST' }), {
    success: 'Generamos un enlace nuevo. Volvé a suscribirte con este.',
    onSuccess: (fresh) => {
      qc.setQueryData(QUERY_KEY, fresh);
      setConfirming(false);
    },
  });

  const httpsUrl = data ? `${window.location.origin}/api/calendar/feed/${data.token}.ics` : '';
  const webcalUrl = httpsUrl.replace(/^https?:/, 'webcal:');

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar: seleccioná el enlace y copialo a mano');
    }
  }

  return (
    <>
      <Dialog open onClose={onClose} title="Agregar a mi calendario" description="Los eventos de tu iglesia aparecen en tu calendario y se actualizan solos.">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClass('secondary', 'md', 'w-full')}
              >
                Google Calendar
              </a>
              <a href={webcalUrl} className={buttonClass('secondary', 'md', 'w-full')}>
                Apple Calendar
              </a>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Outlook u otra app</p>
              <div className="flex gap-2">
                <Input value={httpsUrl} readOnly aria-label="Enlace del calendario" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="secondary" onClick={copy} aria-label="Copiar enlace">
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
              <li>Cada calendario busca novedades por su cuenta: un cambio puede tardar unas horas en verse (en Google, hasta un día).</li>
              <li>Si Google Calendar no abre bien en el celular, copiá el enlace y agregalo desde calendar.google.com, en “Otros calendarios → Desde URL”.</li>
              <li>
                El enlace es personal: no lo compartas.{' '}
                <button type="button" onClick={() => setConfirming(true)} className="font-medium text-fg underline-offset-2 hover:underline">
                  Generar uno nuevo
                </button>
              </li>
            </ul>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => rotate.mutate()}
        loading={rotate.isPending}
        danger
        title="Generar un enlace nuevo"
        message="El enlace actual deja de funcionar y los calendarios que lo usan dejan de actualizarse. Vas a tener que suscribirte de nuevo."
        confirmLabel="Generar"
      />
    </>
  );
}
