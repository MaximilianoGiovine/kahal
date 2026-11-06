import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-document';

export const metadata: Metadata = { title: 'Contrato para iglesias' };

export default function ContractPage() {
  return <LegalPage documentKey="contract" />;
}
