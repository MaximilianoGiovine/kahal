'use client';

import { FinanceCampusFilter, FinanceCampusProvider } from '@/components/finance/finance-campus';
import { FinanceNav } from '@/components/finance/finance-nav';
import { PageHeader } from '@/components/ui';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <FinanceCampusProvider>
      <PageHeader title="Finanzas" description="Tesorería de la iglesia: ingresos, egresos y saldos." />
      <FinanceNav />
      <FinanceCampusFilter />
      {children}
    </FinanceCampusProvider>
  );
}
