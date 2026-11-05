'use client';

import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CurrencyOptions } from '@/components/currency-options';
import { Dialog } from '@/components/dialog';
import { Badge, Button, Card, CardHeader, Checkbox, ErrorState, Field, Input, Loading, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Account, Category, TxType } from '@/lib/types';

export default function FinanceSettingsPage() {
  const accounts = useQuery({ queryKey: ['finance', 'accounts'], queryFn: () => api<Account[]>('/finance/accounts') });
  const categories = useQuery({ queryKey: ['finance', 'categories'], queryFn: () => api<Category[]>('/finance/categories') });
  const [account, setAccount] = useState<Account | 'new' | null>(null);
  const [category, setCategory] = useState<Category | { type: TxType } | null>(null);

  if (accounts.isLoading || categories.isLoading) return <Loading />;
  if (accounts.error || categories.error) return <ErrorState error={accounts.error ?? categories.error} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Cuentas"
          description="Cajas, cuentas bancarias o fondos donde se registra el dinero."
          action={
            <Button size="sm" onClick={() => setAccount('new')}>
              <Plus className="size-4" /> Nueva cuenta
            </Button>
          }
        />
        <ul className="divide-y divide-border">
          {accounts.data?.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {a.name} {!a.active && <Badge className="ml-1">Inactiva</Badge>}
                </p>
                <p className="text-xs text-muted">
                  {a.currency} · Saldo inicial {money(a.initialBalance, a.currency)}
                </p>
              </div>
              <span className="tabular text-sm font-semibold">{money(a.balance, a.currency)}</span>
              <Button variant="ghost" size="sm" onClick={() => setAccount(a)} aria-label={`Editar ${a.name}`}>
                <Pencil className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {(['INCOME', 'EXPENSE'] as const).map((type) => (
          <Card key={type}>
            <CardHeader
              title={type === 'INCOME' ? 'Categorías de ingreso' : 'Categorías de egreso'}
              action={
                <Button size="sm" variant="secondary" onClick={() => setCategory({ type })}>
                  <Plus className="size-4" /> Agregar
                </Button>
              }
            />
            <ul className="divide-y divide-border">
              {categories.data
                ?.filter((c) => c.type === type)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color ?? 'var(--subtle)' }} aria-hidden />
                    <span className={`flex-1 text-sm ${c.active ? '' : 'text-muted line-through'}`}>{c.name}</span>
                    {c.isTithe && <Badge tone="accent">Diezmo</Badge>}
                    <span className="tabular text-xs text-subtle">{c._count?.transactions ?? 0} mov.</span>
                    <Button variant="ghost" size="sm" onClick={() => setCategory(c)} aria-label={`Editar ${c.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>

      {account && <AccountForm item={account === 'new' ? null : account} onClose={() => setAccount(null)} />}
      {category && <CategoryForm item={'id' in category ? category : null} type={category.type} onClose={() => setCategory(null)} />}
    </div>
  );
}

function AccountForm({ item, onClose }: { item: Account | null; onClose: () => void }) {
  const { church } = useSession();
  const save = useAction(
    (body: Record<string, unknown>) => (item ? api(`/finance/accounts/${item.id}`, { method: 'PATCH', body }) : api('/finance/accounts', { method: 'POST', body })),
    { success: 'Cuenta guardada', invalidate: [['finance']], onSuccess: onClose },
  );
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    save.mutate({ ...v, initialBalance: Number(String(v.initialBalance || 0).replace(',', '.')) });
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={item ? 'Editar cuenta' : 'Nueva cuenta'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="account-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="account-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input name="name" required minLength={2} defaultValue={item?.name} placeholder="Ej.: Banco Nación" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Moneda">
            <Select name="currency" defaultValue={item?.currency ?? church?.defaultCurrency ?? 'ARS'}>
              <CurrencyOptions />
            </Select>
          </Field>
          <Field label="Saldo inicial">
            <Input name="initialBalance" inputMode="decimal" pattern="^-?\d+([.,]\d{1,2})?$" defaultValue={item?.initialBalance ?? '0'} />
          </Field>
        </div>
        {item && <Checkbox name="active" label="Cuenta activa" defaultChecked={item.active} />}
      </form>
    </Dialog>
  );
}

function CategoryForm({ item, type, onClose }: { item: Category | null; type: TxType; onClose: () => void }) {
  const save = useAction(
    (body: Record<string, unknown>) => (item ? api(`/finance/categories/${item.id}`, { method: 'PATCH', body }) : api('/finance/categories', { method: 'POST', body })),
    { success: 'Categoría guardada', invalidate: [['finance']], onSuccess: onClose },
  );
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate({ ...formValues(e.currentTarget), type });
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={item ? 'Editar categoría' : type === 'INCOME' ? 'Nueva categoría de ingreso' : 'Nueva categoría de egreso'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="category-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input name="name" required minLength={2} defaultValue={item?.name} />
        </Field>
        <Field label="Color">
          <Input name="color" type="color" defaultValue={item?.color ?? '#64748b'} className="h-10 w-20 p-1" />
        </Field>
        {type === 'INCOME' && <Checkbox name="isTithe" label="Es diezmo (permite asociar el aporte a un miembro)" defaultChecked={item?.isTithe} />}
        {item && <Checkbox name="active" label="Categoría activa" defaultChecked={item.active} />}
      </form>
    </Dialog>
  );
}
