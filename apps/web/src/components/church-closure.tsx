'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Church } from '@/lib/types';
import { DeleteConfirm } from './delete-confirm';
import { Button, Card } from './ui';

/** Baja de la iglesia: se programa con un plazo durante el que se puede cancelar. */
export function ChurchClosure({ church }: { church: Pick<Church, 'slug' | 'deletionScheduledFor'> }) {
  const { me } = useSession();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['church'] });
    qc.invalidateQueries({ queryKey: ['admin'] });
    qc.invalidateQueries({ queryKey: ['billing'] });
    qc.invalidateQueries({ queryKey: ['billing-access'] });
  };
  const schedule = useAction((body: { confirm: string; password?: string }) => api('/church/deletion', { method: 'POST', body }), {
    success: 'Baja programada',
    onSuccess: () => {
      setConfirming(false);
      refresh();
    },
  });
  const cancel = useAction(() => api('/church/deletion', { method: 'DELETE' }), { success: 'Baja cancelada', onSuccess: refresh });

  return (
    <Card className="p-5">
      <p className="font-medium">Baja de la iglesia</p>
      {church.deletionScheduledFor ? (
        <>
          <p className="mt-1 text-sm text-danger">Sus datos y archivos se borrarán a partir del {dateTime(church.deletionScheduledFor, { dateStyle: 'long' })}.</p>
          <p className="mt-1 text-sm text-muted">Hasta entonces puedes cancelar la baja y exportar la información.</p>
          <Button variant="secondary" className="mt-3" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancelar la baja
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Borra la iglesia con sus usuarios, miembros, finanzas y archivos, tras un plazo de 30 días para cancelar.</p>
          <Button variant="danger" className="mt-3" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" /> Pedir la baja
          </Button>
        </>
      )}
      {confirming && (
        <DeleteConfirm
          title="Pedir la baja de la iglesia"
          description="La iglesia dejará de aparecer en público y no admitirá registros nuevos, y su suscripción se cancelará. Pasados 30 días se borrará todo de forma definitiva. Exporta antes lo que debas conservar. Solo quien administra la iglesia puede hacerlo."
          word={church.slug}
          askPassword={me.hasPassword}
          confirmLabel="Programar la baja"
          loading={schedule.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={(values) => schedule.mutate(values)}
        />
      )}
    </Card>
  );
}
