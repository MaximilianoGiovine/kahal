'use client';

import { FinanceNav } from '@/components/finance/finance-nav';
import { PageHeader } from '@/components/ui';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Finanzas" description="Tesorería de la iglesia: ingresos, egresos y saldos." />
      <FinanceNav />
      {children}
    </>
  );
}
