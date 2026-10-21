'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

export default function ProfilePage() {
  const { me, church } = useSession();
  const qc = useQueryClient();
  const [install, setInstall] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const profile = useAction((body: Record<string, unknown>) => api('/users/me', { method: 'PATCH', body }), {
    success: 'Perfil actualizado',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const password = useAction((body: Record<string, unknown>) => api('/auth/change-password', { method: 'POST', body }), { success: 'Contraseña actualizada' });

  function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    if (v.newPassword !== v.confirm) {
      password.reset();
      return void import('sonner').then(({ toast }) => toast.error('Las contraseñas no coinciden'));
    }
    password.mutate({ currentPassword: v.currentPassword, newPassword: v.newPassword }, { onSuccess: () => form.reset() });
  }

  return (
    <>
      <PageHeader title="Mi perfil" description={church ? `${church.name} · ${ROLE_LABEL[me.role]}` : ROLE_LABEL[me.role]} />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Datos personales" />
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              profile.mutate(formValues(e.currentTarget));
            }}
          >
            <Field label="Email">
              <Input value={me.email} disabled />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre">
                <Input name="firstName" required minLength={2} defaultValue={me.firstName} />
              </Field>
              <Field label="Apellido">
                <Input name="lastName" required minLength={2} defaultValue={me.lastName} />
              </Field>
            </div>
            <Field label="Teléfono">
              <Input name="phone" type="tel" defaultValue={me.phone ?? ''} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={profile.isPending}>
                Guardar
              </Button>
            </div>
          </form>
        </Card>
        <Card>
          <CardHeader title="Cambiar contraseña" />
          <form className="flex flex-col gap-4 p-5" onSubmit={onPassword}>
            <Field label="Contraseña actual">
              <Input name="currentPassword" type="password" required autoComplete="current-password" />
            </Field>
            <Field label="Nueva contraseña">
              <Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Repetir nueva contraseña">
              <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={password.isPending}>
                Actualizar
              </Button>
            </div>
          </form>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">
                Instalar Kahal en tu celular <Badge tone="accent">App</Badge>
              </p>
              <p className="mt-1 text-sm text-muted">
                {install
                  ? 'Agregá Kahal a tu pantalla de inicio para abrirla como una app.'
                  : 'En el celular, abrí el menú del navegador y elegí “Agregar a pantalla de inicio” (en iPhone: botón Compartir → “Agregar a inicio”).'}
              </p>
            </div>
            {install && (
              <Button onClick={() => install.prompt().then(() => setInstall(null))}>
                <Download className="size-4" /> Instalar
              </Button>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
