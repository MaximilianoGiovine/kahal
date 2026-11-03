'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getActiveChurch, keepSessionAlive, setActiveChurch } from './api';
import { setTimezone } from './format';
import type { Church, ChurchBrief, Me } from './types';

interface Session {
  me: Me;
  /** Iglesia sobre la que se opera (la propia o la elegida por el super admin). */
  church: ChurchBrief | null;
  isSuperAdmin: boolean;
  churches: Church[];
  selectChurch: (id: string | null) => void;
}

const Ctx = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fuera de SessionProvider');
  return s;
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), staleTime: 5 * 60_000 });
}

export function SessionProvider({ me, children }: { me: Me; children: ReactNode }) {
  const qc = useQueryClient();
  const isSuperAdmin = me.isSuperAdmin;
  const [selected, setSelected] = useState<string | null>(() => (isSuperAdmin ? getActiveChurch() : null));

  const { data: churches = [] } = useQuery({
    queryKey: ['admin', 'churches'],
    queryFn: () => api<Church[]>('/admin/churches'),
    enabled: isSuperAdmin,
  });

  const church = useMemo<ChurchBrief | null>(() => {
    if (!isSuperAdmin) return me.church;
    return churches.find((c) => c.id === selected) ?? null;
  }, [isSuperAdmin, me.church, churches, selected]);

  useEffect(keepSessionAlive, []);

  useEffect(() => {
    if (church?.timezone) setTimezone(church.timezone);
    const root = document.documentElement;
    if (church?.primaryColor) root.style.setProperty('--accent', church.primaryColor);
    else root.style.removeProperty('--accent');
  }, [church]);

  const selectChurch = useCallback(
    (id: string | null) => {
      setActiveChurch(id);
      setSelected(id);
      qc.removeQueries({ predicate: (q) => !['me', 'admin'].includes(String(q.queryKey[0])) });
    },
    [qc],
  );

  return <Ctx.Provider value={{ me, church, isSuperAdmin, churches, selectChurch }}>{children}</Ctx.Provider>;
}
