'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, ButtonLink, Checkbox, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';

export function RegisterForm() {
  const params = useSearchParams();
  const preset = params.get('iglesia') ?? '';
  const { data: churches = [] } = useQuery({
    queryKey: ['public-churches'],
    queryFn: () => api<{ name: string; slug: string; city: string | null }[]>('/public/churches'),
  });
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
      await api('/auth/register', {
        method: 'POST',
        body: {
          churchSlug: fd.get('church'),
          firstName: fd.get('firstName'),
          lastName: fd.get('lastName'),
          email: fd.get('email'),
          phone: fd.get('phone') || undefined,
          password: fd.get('password'),
          consent: fd.get('consent') === 'on',
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el registro');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <p className="mt-4 font-medium">¡Solicitud enviada!</p>
        <p className="mt-1 text-sm text-muted">Cuando la iglesia apruebe tu cuenta vas a recibir un email y podrás ingresar.</p>
        <ButtonLink href="/" variant="secondary" className="mt-6">
          Volver al inicio
        </ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Iglesia">
        <Select name="church" required defaultValue={preset} key={churches.length}>
          <option value="" disabled>
            Elegí tu iglesia
          </option>
          {churches.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
              {c.city ? ` · ${c.city}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre">
          <Input name="firstName" required minLength={2} autoComplete="given-name" />
        </Field>
        <Field label="Apellido">
          <Input name="lastName" required minLength={2} autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Email">
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Teléfono (opcional)">
        <Input name="phone" type="tel" autoComplete="tel" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contraseña">
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Repetir contraseña">
          <Input name="password2" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
      </div>
      <Checkbox
        name="consent"
        required
        label={
          <span className="text-muted">
            Acepto que la iglesia almacene y trate mis datos personales para la gestión de la membresía y la comunicación de actividades, conforme a la Ley 25.326 de
            Protección de Datos Personales.
          </span>
        }
      />
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" loading={loading} className="mt-2">
        Enviar solicitud
      </Button>
    </form>
  );
}
