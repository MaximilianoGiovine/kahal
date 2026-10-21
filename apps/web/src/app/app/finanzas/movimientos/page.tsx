'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Paperclip, Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/dialog';
import { PeriodPicker, resolvePeriod, type Period } from '@/components/finance/period';
import { TransactionForm } from '@/components/finance/transaction-form';
import { ActionMenu } from '@/components/menu';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Loading, Pagination, Select, td, th } from '@/components/ui';
import { api, download, fileUrl } from '@/lib/api';
import { dayLabel, fullName, money } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Account, Category, Paged, Totals, Transaction } from '@/lib/types';

export default function TransactionsPage() {
  const { me } = useSession();
  const writer = can.financeWrite(me.role);
  const [period, setPeriod] = useState<Period>(() => resolvePeriod('month'));
  const [type, setType] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ['finance', 'accounts'], queryFn: () => api<Account[]>('/finance/accounts') });
  const { data: categories = [] } = useQuery({ queryKey: ['finance', 'categories'], queryFn: () => api<Category[]>('/finance/categories') });

  const filters = { from: period.from, to: period.to, type, accountId, categoryId, q: search };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['finance', 'transactions', filters, page],
    queryFn: () => api<Paged<Transaction> & { totals: Totals }>('/finance/transactions', { query: { ...filters, page, pageSize: 30 } }),
    placeholderData: (p) => p,
  });

  const remove = useAction((id: string) => api(`/finance/transactions/${id}`, { method: 'DELETE' }), {
    success: 'Movimiento eliminado',
    invalidate: [['finance'], ['dashboard']],
    onSuccess: () => setDeleting(null),
  });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  // Con una sola cuenta elegida los totales están en una moneda; si no, se muestran sin símbolo mezclado.
  const currencies = new Set((accountId ? accounts.filter((a) => a.id === accountId) : accounts).map((a) => a.currency));
  const single = currencies.size === 1 ? [...currencies][0] : null;

  async function exportXlsx() {
    setExporting(true);
    try {
      await download('/finance/export', filters);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <PeriodPicker value={period} onChange={reset(setPeriod)} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={exportXlsx} loading={exporting}>
                <Download className="size-4" /> Excel
              </Button>
              {writer && (
                <Button onClick={() => setEditing('new')}>
                  <Plus className="size-4" /> Nuevo movimiento
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_13rem_13rem]">
            <div className="relative col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Buscar por descripción, referencia o miembro" className="pl-9" aria-label="Buscar" />
            </div>
            <Select value={type} onChange={(e) => reset(setType)(e.target.value)} aria-label="Tipo" >
              <option value="">Todos los tipos</option>
              <option value="INCOME">Ingresos</option>
              <option value="EXPENSE">Egresos</option>
            </Select>
            <Select value={accountId} onChange={(e) => reset(setAccountId)(e.target.value)} aria-label="Cuenta" >
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
            <Select value={categoryId} onChange={(e) => reset(setCategoryId)(e.target.value)} aria-label="Categoría" className="col-span-2 lg:col-span-1">
              <option value="">Todas las categorías</option>
              {categories
                .filter((c) => !type || c.type === type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type === 'INCOME' ? 'ingreso' : 'egreso'})
                  </option>
                ))}
            </Select>
          </div>
        </div>

        {data && single && (
          <div className="tabular grid grid-cols-3 divide-x divide-border border-b border-border text-center text-sm">
            <div className="py-3">
              <p className="text-xs text-muted">Ingresos</p>
              <p className="font-semibold">{money(data.totals.income, single)}</p>
            </div>
            <div className="py-3">
              <p className="text-xs text-muted">Egresos</p>
              <p className="font-semibold">{money(data.totals.expense, single)}</p>
            </div>
            <div className="py-3">
              <p className="text-xs text-muted">Resultado</p>
              <p className={`font-semibold ${Number(data.totals.net) < 0 ? 'text-danger' : ''}`}>{money(data.totals.net, single)}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-5" />}
            title="No hay movimientos"
            description="No se encontraron movimientos con estos filtros."
            action={
              writer && (
                <Button onClick={() => setEditing('new')}>
                  <Plus className="size-4" /> Registrar movimiento
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="border-b border-border bg-surface-2/50">
                  <tr>
                    <th className={th}>Fecha</th>
                    <th className={th}>Categoría</th>
                    <th className={th}>Detalle</th>
                    <th className={th}>Cuenta</th>
                    <th className={`${th} text-right`}>Monto</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-2/50">
                      <td className={`${td} tabular whitespace-nowrap text-muted`}>{dayLabel(t.date, 'short')}</td>
                      <td className={td}>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: t.category.color ?? 'var(--subtle)' }} aria-hidden />
                          {t.category.name}
                        </span>
                      </td>
                      <td className={td}>
                        <div className="max-w-72">
                          <p className="truncate">{t.description || '—'}</p>
                          <p className="truncate text-xs text-muted">
                            {t.member && fullName(t.member)}
                            {t.member && t.reference && ' · '}
                            {t.reference}
                          </p>
                        </div>
                      </td>
                      <td className={`${td} whitespace-nowrap text-muted`}>{t.account.name}</td>
                      <td className={`${td} tabular text-right font-medium whitespace-nowrap`}>
                        <span className={t.type === 'EXPENSE' ? 'text-fg' : 'text-success'}>
                          {t.type === 'EXPENSE' ? '−' : '+'}
                          {money(t.amount, t.account.currency)}
                        </span>
                      </td>
                      <td className="pr-3">
                        <div className="flex items-center justify-end gap-1">
                          {t.receiptKey && (
                            <a href={fileUrl(t.receiptKey)} target="_blank" rel="noreferrer" className="rounded p-1 text-subtle hover:text-fg" aria-label="Ver comprobante">
                              <Paperclip className="size-4" />
                            </a>
                          )}
                          {writer && (
                            <ActionMenu
                              items={[
                                { label: 'Editar', icon: Pencil, onClick: () => setEditing(t) },
                                { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(t) },
                              ]}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3" onClick={() => writer && setEditing(t)}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.description || t.category.name}</p>
                    <p className="truncate text-xs text-muted">
                      {dayLabel(t.date, 'short')} · {t.category.name}
                      {t.member && ` · ${fullName(t.member)}`}
                    </p>
                  </div>
                  <span className={`tabular text-sm font-medium whitespace-nowrap ${t.type === 'INCOME' ? 'text-success' : ''}`}>
                    {t.type === 'EXPENSE' ? '−' : '+'}
                    {money(t.amount, t.account.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={30} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
      {!single && data && data.items.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          <Badge>Tip</Badge> Filtrá por una cuenta para ver los totales del período (hay cuentas en distintas monedas).
        </p>
      )}

      {editing && <TransactionForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar movimiento"
        message={deleting && `¿Eliminar el movimiento de ${money(deleting.amount, deleting.account.currency)} del ${dayLabel(deleting.date)}?`}
        confirmLabel="Eliminar"
      />
    </>
  );
}
