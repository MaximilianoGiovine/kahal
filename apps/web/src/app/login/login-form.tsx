'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SocialButtons } from '@/components/social-auth';
import { Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { oauthErrorMessage } from '@/lib/oauth';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(() => oauthErrorMessage(params.get('oauth_error')));
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      qc.clear();
      const next = params.get('next');
      router.replace(next?.startsWith('/app') ? next : '/app');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Contraseña">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" loading={loading} className="mt-2">
        Ingresar
      </Button>
      <SocialButtons next={params.get('next')} />
    </form>
  );
}
