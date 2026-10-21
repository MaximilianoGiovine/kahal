'use client';

import { useQuery } from '@tanstack/react-query';
import { type FormEvent } from 'react';
import { Dialog } from '@/components/dialog';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { MEMBER_STATUS_LABEL } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import type { Family, Member, MemberStatus, Ministry } from '@/lib/types';

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

export function MemberForm({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved?: (m: Member) => void }) {
  const { data: families = [] } = useQuery({ queryKey: ['families'], queryFn: () => api<Family[]>('/families') });
  const { data: ministries = [] } = useQuery({ queryKey: ['ministries'], queryFn: () => api<Ministry[]>('/ministries') });
  const selected = new Set(member?.ministries?.map((m) => m.ministry.id));

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
    const ministryIds = Array.from(form.querySelectorAll<HTMLInputElement>('input[data-ministry]:checked')).map((i) => i.value);
    for (const k of Object.keys(v)) if (k.startsWith('ministry:')) delete v[k];
    save.mutate({ ...v, ministryIds });
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
        <Field label="Email">
          <Input name="email" type="email" defaultValue={member?.email ?? ''} />
        </Field>
        <Field label="Teléfono">
          <Input name="phone" type="tel" defaultValue={member?.phone ?? ''} />
        </Field>
        <Field label="Documento">
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
        <Field label="Estado">
          <Select name="status" defaultValue={member?.status ?? 'VISITOR'}>
            {(Object.keys(MEMBER_STATUS_LABEL) as MemberStatus[]).map((s) => (
              <option key={s} value={s}>
                {MEMBER_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <Input name="address" defaultValue={member?.address ?? ''} />
        </Field>
        <Field label="Fecha de ingreso">
          <Input name="joinedAt" type="date" defaultValue={day(member?.joinedAt)} />
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
