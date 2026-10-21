import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar' };

export default function LoginPage() {
  return (
    <AuthShell
      title="Ingresar"
      subtitle="Accedé con el email de tu cuenta."
      footer={
        <>
          ¿Todavía no tenés cuenta?{' '}
          <Link href="/registro" className="font-medium text-accent-ink hover:underline">
            Registrate
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
