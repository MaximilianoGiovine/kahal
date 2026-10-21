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
      subtitle="Tu iglesia revisará la solicitud y te avisaremos por email cuando esté aprobada."
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="font-medium text-accent-ink hover:underline">
            Ingresá
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
