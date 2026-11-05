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
      subtitle="Accede con el email de tu cuenta."
      footer={
        <>
          ¿Todavía no tienes cuenta?{' '}
          <Link href="/registro" className="font-medium text-accent-ink hover:underline">
            Regístrate
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
