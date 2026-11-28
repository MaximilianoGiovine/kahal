'use client';

import { useState } from 'react';
import { Dialog } from '@/components/dialog';
import { RegionFields } from '@/components/region-fields';
import { Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { slugify } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';

export function CreateChurch({ onClose }: { onClose: () => void }) {
  const [slug, setSlug] = useState('');
  const save = useAction((body: Record<string, unknown>) => api('/admin/churches', { method: 'POST', body }), {
    success: 'Iglesia creada con cuentas y categorías iniciales',
    invalidate: [['admin']],
    onSuccess: onClose,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nueva iglesia"
      description="Se crea con categorías y cuentas por defecto y el usuario del pastor."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="church-form" loading={save.isPending}>
            Crear iglesia
          </Button>
        </>
      }
    >
      <form
        id="church-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          save.mutate({
            name: v.name,
            slug: v.slug,
            city: v.city || undefined,
            timezone: v.timezone,
            currency: v.currency,
            admin: { firstName: v.adminFirstName, lastName: v.adminLastName, email: v.adminEmail, password: v.adminPassword },
          });
        }}
      >
        <Field label="Nombre de la iglesia" className="sm:col-span-2">
          <Input name="name" required minLength={2} onChange={(e) => setSlug(slugify(e.target.value))} />
        </Field>
        <Field label="Identificador (URL)" hint={`/i/${slug || 'mi-iglesia'}`}>
          <Input name="slug" required pattern="^[a-z0-9]+(-[a-z0-9]+)*$" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <Input name="city" />
        </Field>
        <RegionFields />
        <p className="pt-2 text-sm font-semibold sm:col-span-2">Pastor de la iglesia</p>
        <Field label="Nombre">
          <Input name="adminFirstName" required minLength={2} />
        </Field>
        <Field label="Apellido">
          <Input name="adminLastName" required minLength={2} />
        </Field>
        <Field label="Email">
          <Input name="adminEmail" type="email" required />
        </Field>
        <Field label="Contraseña inicial">
          <Input name="adminPassword" type="text" required minLength={8} autoComplete="off" />
        </Field>
      </form>
    </Dialog>
  );
}
