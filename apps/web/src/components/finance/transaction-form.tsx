'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/dialog';
import { useCampusAspect } from '@/components/campuses';
import { useFinanceCampus } from '@/components/finance/finance-campus';
import { MemberPicker } from '@/components/member-picker';
import { Button, Field, Input, Select } from '@/components/ui';
import { api, fileUrl, upload } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import type { Account, Category, Transaction, TxType } from '@/lib/types';

/** Edita un movimiento existente o registra uno nuevo del tipo indicado. */
export function TransactionForm({ item, type: initialType = 'INCOME', onClose }: { item: Transaction | null; type?: TxType; onClose: () => void }) {
  const [type, setType] = useState<TxType>(item?.type ?? initialType);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [receipt, setReceipt] = useState(item?.receiptKey ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { campusId } = useFinanceCampus();
  const showCampus = useCampusAspect('FINANCE');
  const { data: accounts = [] } = useQuery({ queryKey: ['finance', 'accounts', campusId], queryFn: () => api<Account[]>('/finance/accounts', { query: { campusId } }) });
  const { data: categories = [] } = useQuery({ queryKey: ['finance', 'categories'], queryFn: () => api<Category[]>('/finance/categories') });

  const cats = categories.filter((c) => c.type === type && (c.active || c.id === item?.categoryId));
  const category = categories.find((c) => c.id === categoryId);

  const save = useAction(
    (body: Record<string, unknown>) => (item ? api(`/finance/transactions/${item.id}`, { method: 'PATCH', body }) : api('/finance/transactions', { method: 'POST', body })),
    { success: item ? 'Movimiento actualizado' : type === 'INCOME' ? 'Ingreso registrado' : 'Egreso registrado', invalidate: [['finance'], ['dashboard'], ['member']], onSuccess: onClose },
  );

  async function onFile(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      setReceipt((await upload(file, 'receipt')).key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el comprobante');
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    save.mutate({
      ...v,
      amount: Number(String(v.amount).replace(',', '.')),
      memberId: type === 'INCOME' ? v.memberId || null : null,
      receiptKey: receipt || null,
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Editar movimiento' : type === 'INCOME' ? 'Registrar ingreso' : 'Registrar egreso'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="tx-form" loading={save.isPending} disabled={uploading}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Al registrar, el tipo lo define el botón elegido; al editar se puede corregir. */}
        {item && (
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Tipo de movimiento">
            {(['INCOME', 'EXPENSE'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => {
                  setType(t);
                  setCategoryId('');
                }}
                className={clsx('rounded-md py-2 text-sm font-medium transition', type === t ? 'bg-surface text-fg shadow-sm' : 'text-muted')}
              >
                {t === 'INCOME' ? 'Ingreso' : 'Egreso'}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monto">
            <Input name="amount" inputMode="decimal" required pattern="^\d+([.,]\d{1,2})?$" defaultValue={item?.amount} placeholder="0,00" title="Número con hasta 2 decimales" />
          </Field>
          <Field label="Fecha">
            <Input name="date" type="date" required defaultValue={item?.date.slice(0, 10) ?? todayISO()} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoría">
            <Select name="categoryId" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="" disabled>
                Elegir…
              </option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cuenta">
            <Select name="accountId" required defaultValue={item?.accountId ?? ''} key={accounts.length}>
              <option value="" disabled>
                Elegir…
              </option>
              {accounts
                .filter((a) => a.active || a.id === item?.accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                    {showCampus && a.campus && ` · ${a.campus.name}`}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        {type === 'INCOME' && (
          <Field label={category?.isTithe ? 'Miembro que diezma' : 'Miembro (opcional)'} hint={category?.isTithe ? 'Asociar el diezmo permite emitir constancias por miembro.' : undefined}>
            <MemberPicker name="memberId" initial={item?.member} />
          </Field>
        )}
        <Field label="Descripción">
          <Input name="description" maxLength={500} defaultValue={item?.description ?? ''} placeholder="Ej.: Ofrenda culto dominical" />
        </Field>
        <Field label="Referencia / N° de comprobante">
          <Input name="reference" maxLength={100} defaultValue={item?.reference ?? ''} />
        </Field>
        <div>
          <span className="text-sm font-medium">Comprobante</span>
          <div className="mt-1.5">
            {receipt ? (
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <FileText className="size-4 text-muted" />
                <a href={fileUrl(receipt)} target="_blank" rel="noreferrer" className="flex-1 text-accent-ink hover:underline">
                  Ver comprobante
                </a>
                <button type="button" onClick={() => setReceipt('')} className="text-muted hover:text-fg" aria-label="Quitar comprobante">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Adjuntar imagen o PDF
              </Button>
            )}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
