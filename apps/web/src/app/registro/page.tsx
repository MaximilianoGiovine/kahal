import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Registrarme' };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Crear mi cuenta"
      subtitle="Únete a tu iglesia en Kahal. Vas a poder ingresar en cuanto completes el registro."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-medium text-accent-ink hover:underline">
            Ingresa
          </Link>
        </>
      }
    >
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
