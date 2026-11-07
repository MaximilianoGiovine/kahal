'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { Badge, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';

interface FacebookStatus {
  available: boolean;
  page: { id: string; name: string; invalid: boolean } | null;
}

const ERRORS: Record<string, string> = {
  cancelled: 'Cancelaste la conexión con Facebook.',
  no_pages: 'Tu cuenta de Facebook no administra ninguna página, o no diste permiso para verlas. Ingresa con una cuenta que administre la página de la iglesia.',
  provider_error: 'No se pudo conectar la página de Facebook. Vuelve a intentarlo.',
};

/** Conecta la página de Facebook de la iglesia para que sus transmisiones en vivo se publiquen solas. */
export function FacebookPageConnection({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['facebook-page'], queryFn: () => api<FacebookStatus>('/church/facebook') });
  const [connecting, setConnecting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Resultado de volver de Facebook. Se lee sin useSearchParams para no exigir un Suspense en toda la página.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('facebook');
    const failed = params.get('facebook_error');
    if (!result && !failed) return;
    if (result === 'connected') {
      toast.success('Página de Facebook conectada');
      qc.invalidateQueries({ queryKey: ['facebook-page'] });
      qc.invalidateQueries({ queryKey: ['church'] });
    }
    if (result === 'choose') setChoosing(true);
    if (failed) toast.error(ERRORS[failed] ?? ERRORS.provider_error);
    window.history.replaceState(null, '', window.location.pathname);
  }, [qc]);

  const disconnect = useAction(() => api('/church/facebook', { method: 'DELETE' }), {
    success: 'Página de Facebook desconectada',
    invalidate: [['facebook-page']],
    onSuccess: () => setDisconnecting(false),
  });

  async function connect() {
    setConnecting(true);
    try {
      const { url } = await api<{ url: string }>('/church/facebook/start', { method: 'POST' });
      window.location.assign(url);
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : 'No se pudo conectar');
    }
  }

  if (!data?.available) return null;
  const page = data.page;

  return (
    <div className={clsx('flex flex-col gap-2 rounded-xl border border-border p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Página de Facebook</p>
          {page ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {page.name}
              {page.invalid ? <Badge tone="warning">Hay que volver a conectarla</Badge> : <Badge tone="success">Conectada</Badge>}
            </p>
          ) : (
            <p className="text-sm text-muted">Conéctala para que sus transmisiones en vivo aparezcan solas en Kahal.</p>
          )}
        </div>
        <div className="flex gap-2">
          {page && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setDisconnecting(true)}>
              Desconectar
            </Button>
          )}
          {(!page || page.invalid) && (
            <Button type="button" size="sm" loading={connecting} onClick={connect}>
              {page ? 'Volver a conectar' : 'Conectar con Facebook'}
            </Button>
          )}
        </div>
      </div>
      {page?.invalid && (
        <p className="text-xs text-warning">
          Facebook dejó de dar acceso a la página: puede que quien la conectó ya no la administre o haya quitado el permiso. Vuelve a conectarla con una cuenta que la administre.
        </p>
      )}
      {!page && <p className="text-xs text-muted">Tienes que ingresar con una cuenta de Facebook que administre la página. Kahal solo lee sus transmisiones en vivo: no publica nada.</p>}

      {choosing && <ChoosePage onClose={() => setChoosing(false)} />}
      <ConfirmDialog
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        onConfirm={() => disconnect.mutate()}
        loading={disconnect.isPending}
        danger
        title="Desconectar Facebook"
        message="Las transmisiones de Facebook ya no se publicarán solas. Podrás seguir agregándolas a mano."
        confirmLabel="Desconectar"
      />
    </div>
  );
}

function ChoosePage({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['facebook-pages'], queryFn: () => api<{ id: string; name: string }[]>('/church/facebook/pages') });
  const choose = useAction((pageId: string) => api('/church/facebook/page', { method: 'POST', body: { pageId } }), {
    success: 'Página de Facebook conectada',
    invalidate: [['facebook-page'], ['church']],
    onSuccess: onClose,
  });

  return (
    <Dialog open onClose={onClose} title="Elige la página de la iglesia" size="sm">
      {isLoading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted">La selección venció. Vuelve a conectar la página de Facebook.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Tu cuenta administra varias páginas. ¿Cuál es la de la iglesia?</p>
          {data.map((p) => (
            <Button key={p.id} type="button" variant="secondary" disabled={choose.isPending} onClick={() => choose.mutate(p.id)} className="justify-start">
              {p.name}
            </Button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
