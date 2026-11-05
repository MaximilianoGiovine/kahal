import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { RequestForm } from './request-form';

export const metadata: Metadata = { title: 'Solicitar el alta de una iglesia' };

export default function RequestChurchPage() {
  return (
    <AuthShell
      title="Agrega tu iglesia a Kahal"
      subtitle="Revisamos cada solicitud. Cuando esté aprobada, te avisamos por email y ya puedes ingresar."
      footer={
        <>
          ¿Tu iglesia ya está en Kahal?{' '}
          <Link href="/login" className="font-medium text-accent-ink hover:underline">
            Ingresa
          </Link>
        </>
      }
    >
      <RequestForm />
    </AuthShell>
  );
}
