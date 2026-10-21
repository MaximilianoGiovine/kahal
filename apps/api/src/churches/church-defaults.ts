import { Currency, Prisma, TransactionType } from '@prisma/client';

export const DEFAULT_CATEGORIES: { name: string; type: TransactionType; color: string; isTithe?: boolean }[] = [
  { name: 'Diezmos', type: 'INCOME', color: '#16a34a', isTithe: true },
  { name: 'Ofrendas', type: 'INCOME', color: '#22c55e' },
  { name: 'Ofrendas especiales', type: 'INCOME', color: '#4ade80' },
  { name: 'Donaciones', type: 'INCOME', color: '#0d9488' },
  { name: 'Eventos', type: 'INCOME', color: '#0ea5e9' },
  { name: 'Otros ingresos', type: 'INCOME', color: '#64748b' },
  { name: 'Alquiler', type: 'EXPENSE', color: '#dc2626' },
  { name: 'Servicios', type: 'EXPENSE', color: '#ea580c' },
  { name: 'Sueldos y honorarios', type: 'EXPENSE', color: '#d97706' },
  { name: 'Mantenimiento', type: 'EXPENSE', color: '#ca8a04' },
  { name: 'Misiones', type: 'EXPENSE', color: '#9333ea' },
  { name: 'Ayuda social', type: 'EXPENSE', color: '#db2777' },
  { name: 'Eventos', type: 'EXPENSE', color: '#2563eb' },
  { name: 'Equipamiento', type: 'EXPENSE', color: '#4f46e5' },
  { name: 'Otros egresos', type: 'EXPENSE', color: '#64748b' },
];

export const DEFAULT_ACCOUNTS: { name: string; currency: Currency }[] = [
  { name: 'Caja general', currency: 'ARS' },
  { name: 'Banco', currency: 'ARS' },
];

/** Crea categorías y cuentas iniciales para una iglesia nueva. */
export async function setupChurchDefaults(tx: Prisma.TransactionClient, churchId: string) {
  await tx.financeCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, isTithe: c.isTithe ?? false, churchId })),
  });
  await tx.financeAccount.createMany({ data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, churchId })) });
}
