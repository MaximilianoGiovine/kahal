'use client';

import { Bell, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { disablePush, enablePush, readPushStatus, type PushStatus } from '@/lib/push';
import { Button, Card } from './ui';

const IOS_STEPS = 'En iPhone, primero agregá Kahal a la pantalla de inicio: botón Compartir → “Agregar a inicio”. Después abrila desde ese ícono y activalas acá.';

function usePush() {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readPushStatus()
      .then((r) => {
        setStatus(r.status);
        setPublicKey(r.publicKey);
      })
      .catch(() => setStatus('unsupported'));
  }, []);

  async function run(action: () => Promise<PushStatus>) {
    setBusy(true);
    try {
      setStatus(await action());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron cambiar las notificaciones');
    } finally {
      setBusy(false);
    }
  }

  return {
    status,
    busy,
    enable: () => run(() => enablePush(publicKey!)),
    disable: () => run(() => disablePush().then(() => 'off' as const)),
  };
}

const MESSAGES: Record<PushStatus, string> = {
  loading: 'Revisando este dispositivo…',
  unsupported: 'Este navegador no admite notificaciones. En iPhone se necesita iOS 16.4 o posterior.',
  'needs-install': IOS_STEPS,
  unconfigured: 'Las notificaciones todavía no están habilitadas en este servidor.',
  denied: 'Las bloqueaste en este dispositivo. Para activarlas, permitilas desde los ajustes del teléfono o del navegador.',
  off: 'Recibí en este dispositivo las novedades, los eventos, las transmisiones en vivo y tus citas.',
  on: 'Activadas en este dispositivo.',
};

/** Tarjeta de Mi perfil. */
export function PushSettings() {
  const { status, busy, enable, disable } = usePush();
  const test = async () => {
    try {
      await api('/push/test', { method: 'POST' });
      toast.success('Enviada: debería llegarte en unos segundos');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar');
    }
  };

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Notificaciones</p>
          <p className="mt-1 text-sm text-muted">{MESSAGES[status]}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {status === 'off' && (
            <Button loading={busy} onClick={enable}>
              <Bell className="size-4" /> Activar
            </Button>
          )}
          {status === 'on' && (
            <>
              <Button variant="secondary" onClick={test}>
                Probar
              </Button>
              <Button variant="ghost" loading={busy} onClick={disable}>
                Desactivar
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

const DISMISSED = 'kahal_push_prompt_dismissed';

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
}

/** Aviso dentro de la app para que se enteren de que pueden activarlas. Se descarta una vez y no vuelve. */
export function PushPrompt() {
  const { status, busy, enable } = usePush();
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(wasDismissed()), []);

  if (hidden || (status !== 'off' && status !== 'needs-install')) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Sin almacenamiento, el aviso vuelve a aparecer la próxima vez.
    }
  };

  return (
    <Card className="mb-6 flex items-start gap-3 p-4">
      <Bell className="mt-0.5 size-5 shrink-0 text-accent-ink" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Activá las notificaciones</p>
        <p className="mt-0.5 text-sm text-muted">{status === 'off' ? 'Enterate al momento de las novedades, las transmisiones en vivo y tus citas.' : IOS_STEPS}</p>
        {status === 'off' && (
          <Button size="sm" className="mt-3" loading={busy} onClick={enable}>
            Activar
          </Button>
        )}
      </div>
      <button type="button" onClick={dismiss} className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Descartar">
        <X className="size-4" />
      </button>
    </Card>
  );
}
