'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MemberStatus, StatusRef } from '@/lib/types';

export function useMemberStatuses() {
  return useQuery({ queryKey: ['member-statuses'], queryFn: () => api<MemberStatus[]>('/member-statuses') });
}

/** Etiqueta con el color elegido por la iglesia (legible en tema claro y oscuro). */
export function StatusBadge({ status }: { status: StatusRef }) {
  const color = status.color ?? 'var(--muted)';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: `color-mix(in srgb, ${color} 70%, var(--fg))`, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {status.name}
    </span>
  );
}

export function StatusBadges({ statuses, empty = '—' }: { statuses?: { status: StatusRef }[]; empty?: string }) {
  if (!statuses?.length) return <span className="text-sm text-muted">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {statuses.map(({ status }) => (
        <StatusBadge key={status.id} status={status} />
      ))}
    </span>
  );
}
