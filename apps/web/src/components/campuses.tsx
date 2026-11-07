'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge, Checkbox, Field, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { CampusAspect, CampusList, CampusRef } from '@/lib/types';

/** Valor de los filtros para lo que no tiene sede (igual que en la API). */
export const NO_CAMPUS = 'none';

export function useCampuses() {
  return useQuery({ queryKey: ['campuses'], queryFn: () => api<CampusList>('/campuses'), staleTime: 60_000 });
}

/** La sede de cada persona importa si algo se separa además de las finanzas, que dependen de la cuenta. */
function aspectInUse(data: CampusList | undefined, aspect: CampusAspect) {
  if (!data?.enabled) return false;
  return aspect === 'MEMBERS' ? data.separated.some((a) => a !== 'FINANCE') : data.separated.includes(aspect);
}

/** Si el área se maneja por sede: con esta iglesia, ¿corresponde mostrar sedes ahí? */
export function useCampusAspect(aspect: CampusAspect) {
  return aspectInUse(useCampuses().data, aspect);
}

/** Si el usuario puede cambiar algo de esa sede. Lo general es solo para quien gestiona toda la iglesia. */
export function useCanManageCampus(aspect: CampusAspect) {
  const { me } = useSession();
  const scope = me.campusScopes[aspect];
  return (campusId: string | null) => scope === null || (!!campusId && scope.includes(campusId));
}

/** Filtro por sede. No aparece si el área es compartida, ni si solo hay una sede para elegir. */
export function CampusFilter({ aspect, value, onChange, noneLabel, className }: { aspect: CampusAspect; value: string; onChange: (id: string) => void; noneLabel: string; className?: string }) {
  const { me } = useSession();
  const { data } = useCampuses();
  const scope = me.campusScopes[aspect];
  const items = (data?.items ?? []).filter((c) => scope === null || scope.includes(c.id));
  if (!aspectInUse(data, aspect) || (scope !== null && items.length < 2)) return null;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Sede" className={className}>
      <option value="">{scope === null ? 'Todas las sedes' : 'Mis sedes'}</option>
      {items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.active ? '' : ' (archivada)'}
        </option>
      ))}
      {scope === null && <option value={NO_CAMPUS}>{noneLabel}</option>}
    </Select>
  );
}

/** Campo de sede para formularios. Quien está limitado a ciertas sedes no puede dejarlo vacío. */
export function CampusField({ aspect, current, emptyLabel, hint, className }: { aspect: CampusAspect; current?: string | null; emptyLabel: string; hint?: string; className?: string }) {
  const { me } = useSession();
  const { data } = useCampuses();
  if (!aspectInUse(data, aspect)) return null;
  const scope = me.campusScopes[aspect];
  const options = data!.items.filter((c) => (c.active && (scope === null || scope.includes(c.id))) || c.id === current);
  const wholeChurch = scope === null;
  const initial = current ?? (!wholeChurch && options.length === 1 ? options[0].id : '');
  return (
    <Field label="Sede" hint={hint} className={className}>
      <Select name="campusId" defaultValue={initial} required={!wholeChurch} key={options.length}>
        <option value="" disabled={!wholeChurch}>
          {wholeChurch ? emptyLabel : 'Elige una sede'}
        </option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Etiqueta de lo publicado para una sede. Lo general no la lleva. */
export function CampusBadge({ aspect, campus }: { aspect: CampusAspect; campus?: CampusRef | null }) {
  const inUse = useCampusAspect(aspect);
  if (!inUse || !campus) return null;
  return <Badge>{campus.name}</Badge>;
}

/** Limita al usuario, en lo que la iglesia separa por sede. */
export function CampusAccessPicker({
  restricted,
  campusIds,
  onChange,
}: {
  restricted: boolean;
  campusIds: string[];
  onChange: (next: { restricted: boolean; campusIds: string[] }) => void;
}) {
  const { data } = useCampuses();
  if (!data?.enabled) return null;
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-2 text-sm font-medium">Acceso por sede</legend>
      <Checkbox
        checked={restricted}
        onChange={(e) => onChange({ restricted: e.target.checked, campusIds })}
        label={
          <>
            <span className="font-medium">Limitar a ciertas sedes</span>
            <span className="block text-xs text-muted">
              En lo que la iglesia separa por sede, solo opera sobre esas sedes; lo compartido lo sigue viendo completo. Pierde lo que afecta a toda la iglesia: datos de la iglesia, usuarios, roles, estados y registro de actividad. No aplica al rol de administración.
            </span>
          </>
        }
      />
      {restricted && (
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          {data.items.map((c) => (
            <Checkbox
              key={c.id}
              checked={campusIds.includes(c.id)}
              onChange={(e) => onChange({ restricted, campusIds: e.target.checked ? [...campusIds, c.id] : campusIds.filter((id) => id !== c.id) })}
              label={`${c.name}${c.active ? '' : ' (archivada)'}`}
            />
          ))}
          {data.items.length === 0 && <p className="text-sm text-muted">Todavía no hay sedes creadas.</p>}
        </div>
      )}
    </fieldset>
  );
}
