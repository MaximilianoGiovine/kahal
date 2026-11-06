'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { CampusFilter } from '@/components/campuses';

const Ctx = createContext<{ campusId: string; setCampusId: (id: string) => void }>({ campusId: '', setCampusId: () => {} });

/** La sede elegida se mantiene al pasar entre las pantallas de Finanzas. */
export const useFinanceCampus = () => useContext(Ctx);

export function FinanceCampusProvider({ children }: { children: ReactNode }) {
  const [campusId, setCampusId] = useState('');
  return <Ctx.Provider value={{ campusId, setCampusId }}>{children}</Ctx.Provider>;
}

export function FinanceCampusFilter() {
  const { campusId, setCampusId } = useFinanceCampus();
  return <CampusFilter value={campusId} onChange={setCampusId} noneLabel="Cuentas generales" className="mb-6 sm:w-64" />;
}
