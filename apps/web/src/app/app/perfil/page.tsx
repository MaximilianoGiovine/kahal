'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ConnectedAccounts } from '@/components/social-auth';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { roleNames } from '@/lib/format';
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['member'] });
    },
  });
  const m = me.member;

  function onProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    if (!m) return profile.mutate({ firstName: v.firstName, lastName: v.lastName, phone: v.phone });
    profile.mutate({ ...v, birthDate: v.birthDate || undefined, baptized: v.baptized === 'yes' ? true : v.baptized === 'no' ? false : undefined });
  }
  const password = useAction((body: Record<string, unknown>) => api('/auth/change-password', { method: 'POST', body }), {
    success: me.hasPassword ? 'Contraseña actualizada' : 'Contraseña creada',
    invalidate: [['me']],
  });

  function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    if (v.newPassword !== v.confirm) {
      password.reset();
      return void import('sonner').then(({ toast }) => toast.error('Las contraseñas no coinciden'));
    }
    password.mutate({ currentPassword: me.hasPassword ? v.currentPassword : undefined, newPassword: v.newPassword }, { onSuccess: () => form.reset() });
  }

  return (
    <>
      <PageHeader title="Mi perfil" description={church ? `${church.name} · ${roleNames(me)}` : roleNames(me)} />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Datos personales" />
          <form className="flex flex-col gap-4 p-5" onSubmit={onProfile}>
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
            {m && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Número de carnet">
                  <Input name="documentId" maxLength={30} defaultValue={m.documentId ?? ''} />
                </Field>
                <Field label="Fecha de nacimiento">
                  <Input name="birthDate" type="date" defaultValue={m.birthDate?.slice(0, 10) ?? ''} />
                </Field>
              </div>
            )}
            {m && (
              <Field label="¿Estás bautizado/a?">
                <Select name="baptized" defaultValue={m.baptized == null ? '' : m.baptized ? 'yes' : 'no'}>
                  <option value="" disabled>
                    Elegí una opción
                  </option>
                  <option value="yes">Sí</option>
                  <option value="no">No</option>
                </Select>
              </Field>
            )}
            <Field label="Teléfono">
              <Input name="phone" type="tel" defaultValue={me.phone ?? ''} />
            </Field>
            {m && (
              <Field label="Dirección del domicilio">
                <Input name="address" maxLength={200} defaultValue={m.address ?? ''} />
              </Field>
            )}
            {m && <p className="text-xs text-muted">Estos datos son los de tu ficha en la iglesia: al guardarlos se actualizan también ahí.</p>}
            <div className="flex justify-end">
              <Button type="submit" loading={profile.isPending}>
                Guardar
              </Button>
            </div>
          </form>
        </Card>
        <Card>
          <CardHeader title={me.hasPassword ? 'Cambiar contraseña' : 'Crear contraseña'} />
          <form className="flex flex-col gap-4 p-5" onSubmit={onPassword}>
            {me.hasPassword ? (
              <Field label="Contraseña actual">
                <Input name="currentPassword" type="password" required autoComplete="current-password" />
              </Field>
            ) : (
              <p className="text-sm text-muted">Hoy ingresás solo con Google o Apple. Con una contraseña también vas a poder ingresar con tu email.</p>
            )}
            <Field label="Nueva contraseña">
              <Input name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Repetir nueva contraseña">
              <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={password.isPending}>
                {me.hasPassword ? 'Actualizar' : 'Crear'}
              </Button>
            </div>
          </form>
        </Card>
        <ConnectedAccounts />
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
