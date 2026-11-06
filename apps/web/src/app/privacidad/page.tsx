import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-document';

export const metadata: Metadata = { title: 'Política de Privacidad' };

export default function PrivacyPage() {
  return <LegalPage documentKey="privacy" />;
}
