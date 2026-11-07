'use client';

import { useQuery } from '@tanstack/react-query';
import { type FormEvent } from 'react';
import { CampusField } from '@/components/campuses';
import { Dialog } from '@/components/dialog';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { formValues, useAction } from '@/lib/hooks';
import type { Family, Member, Ministry } from '@/lib/types';
import { useMemberStatuses } from './member-statuses';

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

export function MemberForm({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved?: (m: Member) => void }) {
  const { data: families = [] } = useQuery({ queryKey: ['families'], queryFn: () => api<Family[]>('/families') });
  const { data: ministries = [] } = useQuery({ queryKey: ['ministries'], queryFn: () => api<Ministry[]>('/ministries') });
  const { data: statuses = [] } = useMemberStatuses();
  const selected = new Set(member?.ministries?.map((m) => m.ministry.id));
  // Una ficha nueva arranca con los estados marcados como "al crear cuenta".
  const selectedStatuses = new Set(member ? member.statuses?.map((s) => s.status.id) : statuses.filter((s) => s.isDefault).map((s) => s.id));

  const save = useAction(
    (body: Record<string, unknown>) => (member ? api<Member>(`/members/${member.id}`, { method: 'PATCH', body }) : api<Member>('/members', { method: 'POST', body })),
    {
      success: member ? 'Ficha actualizada' : 'Miembro agregado',
      invalidate: [['members'], ['member'], ['ministries'], ['families'], ['dashboard']],
      onSuccess: (m) => {
        onSaved?.(m);
        onClose();
      },
    },
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    const checked = (attr: string) => Array.from(form.querySelectorAll<HTMLInputElement>(`input[${attr}]:checked`)).map((i) => i.value);
    for (const k of Object.keys(v)) if (k.startsWith('ministry:') || k.startsWith('status:')) delete v[k];
    const baptized = v.baptized === 'yes' ? true : v.baptized === 'no' ? false : null;
    save.mutate({ ...v, baptized, ministryIds: checked('data-ministry'), statusIds: checked('data-status') });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={member ? 'Editar miembro' : 'Nuevo miembro'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="member-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <Input name="firstName" required defaultValue={member?.firstName} />
        </Field>
        <Field label="Apellido">
          <Input name="lastName" required defaultValue={member?.lastName} />
        </Field>
        {member?.user ? (
          <Field label="Email" hint="Es el email con el que ingresa a la app.">
            <Input type="email" value={member.email ?? ''} disabled />
          </Field>
        ) : (
          <Field label="Email">
            <Input name="email" type="email" defaultValue={member?.email ?? ''} />
          </Field>
        )}
        <Field label="Teléfono">
          <Input name="phone" type="tel" defaultValue={member?.phone ?? ''} />
        </Field>
        <CampusField aspect="MEMBERS" current={member?.campusId} emptyLabel="Sin sede" className="sm:col-span-2" />
        <Field label="Número de documento">
          <Input name="documentId" defaultValue={member?.documentId ?? ''} />
        </Field>
        <Field label="Fecha de nacimiento">
          <Input name="birthDate" type="date" defaultValue={day(member?.birthDate)} />
        </Field>
        <Field label="Género">
          <Select name="gender" defaultValue={member?.gender ?? ''}>
            <option value="">Sin especificar</option>
            <option value="FEMALE">Femenino</option>
            <option value="MALE">Masculino</option>
          </Select>
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <Input name="address" defaultValue={member?.address ?? ''} />
        </Field>
        <Field label="Fecha de ingreso">
          <Input name="joinedAt" type="date" defaultValue={day(member?.joinedAt)} />
        </Field>
        <Field label="¿Bautizado/a?">
          <Select name="baptized" defaultValue={member?.baptized == null ? '' : member.baptized ? 'yes' : 'no'}>
            <option value="">Sin especificar</option>
            <option value="yes">Sí</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Fecha de bautismo">
          <Input name="baptismDate" type="date" defaultValue={day(member?.baptismDate)} />
        </Field>
        <Field label="Familia">
          <Select name="familyId" defaultValue={member?.familyId ?? ''} key={families.length}>
            <option value="">Sin familia</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rol en la familia">
          <Input name="familyRole" defaultValue={member?.familyRole ?? ''} placeholder="Jefe/a de familia, cónyuge, hijo/a…" />
        </Field>
        {statuses.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Estados</legend>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <label key={s.id} className="cursor-pointer">
                  <input type="checkbox" data-status value={s.id} name={`status:${s.id}`} defaultChecked={selectedStatuses.has(s.id)} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-border px-3 py-1 text-sm text-muted transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
                    <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: s.color ?? 'var(--subtle)' }} aria-hidden />
                    {s.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {ministries.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Ministerios</legend>
            <div className="flex flex-wrap gap-2">
              {ministries.map((m) => (
                <label key={m.id} className="cursor-pointer">
                  <input type="checkbox" data-ministry value={m.id} name={`ministry:${m.id}`} defaultChecked={selected.has(m.id)} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-border px-3 py-1 text-sm text-muted transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
                    {m.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Field label="Notas" className="sm:col-span-2">
          <Textarea name="notes" rows={3} defaultValue={member?.notes ?? ''} />
        </Field>
      </form>
    </Dialog>
  );
}
