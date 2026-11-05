'use client';

import { CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, ButtonLink, Checkbox, Field, Input, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { slugify } from '@/lib/format';

export function RequestForm() {
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get('password') !== fd.get('password2')) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api('/public/church-requests', {
        method: 'POST',
        body: {
          name: fd.get('name'),
          slug,
          city: fd.get('city') || undefined,
          message: fd.get('message') || undefined,
          firstName: fd.get('firstName'),
          lastName: fd.get('lastName'),
          email: fd.get('email'),
          phone: fd.get('phone'),
          password: fd.get('password'),
          consent: fd.get('consent') === 'on',
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <p className="mt-4 font-medium">¡Recibimos tu solicitud!</p>
        <p className="mt-1 text-sm text-muted">Te vamos a avisar por email cuando esté revisada. Vas a ingresar con la contraseña que elegiste.</p>
        <ButtonLink href="/" variant="secondary" className="mt-6">
          Volver al inicio
        </ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Nombre de la iglesia">
        <Input name="name" required minLength={2} maxLength={120} onChange={(e) => setSlug(slugify(e.target.value))} />
      </Field>
      <Field label="Identificador (URL)" hint={`/i/${slug || 'mi-iglesia'}`}>
        <Input name="slug" required maxLength={60} pattern="^[a-z0-9]+(-[a-z0-9]+)*$" title="Solo minúsculas, números y guiones" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </Field>
      <Field label="Ciudad">
        <Input name="city" maxLength={120} />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Pastor o responsable</legend>
        <div className="grid grid-cols-2 gap-3">
          <Input name="firstName" required minLength={2} maxLength={60} placeholder="Nombre(s)" aria-label="Nombre(s)" autoComplete="given-name" />
          <Input name="lastName" required minLength={2} maxLength={60} placeholder="Apellido(s)" aria-label="Apellido(s)" autoComplete="family-name" />
        </div>
      </fieldset>
      <Field label="Correo electrónico">
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Teléfono">
        <Input name="phone" type="tel" required minLength={6} maxLength={40} autoComplete="tel" />
      </Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres. La vas a usar para ingresar cuando se apruebe la solicitud.">
        <Input name="password" type="password" required minLength={8} maxLength={100} autoComplete="new-password" />
      </Field>
      <Field label="Repetir contraseña">
        <Input name="password2" type="password" required minLength={8} maxLength={100} autoComplete="new-password" />
      </Field>
      <Field label="Mensaje (opcional)">
        <Textarea name="message" rows={3} maxLength={1000} placeholder="Contanos sobre tu iglesia" />
      </Field>
      <Checkbox
        name="consent"
        required
        label={<span className="text-muted">Acepto que Kahal almacene y trate estos datos para evaluar la solicitud y administrar la cuenta, conforme a la Ley 25.326 de Protección de Datos Personales.</span>}
      />
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" loading={loading} className="mt-2">
        Enviar solicitud
      </Button>
    </form>
  );
}
