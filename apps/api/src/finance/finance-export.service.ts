import { Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { CampusScope, NO_CAMPUS } from '../common/campus-scope';
import { addTableSheet, DATE_FMT, MONEY_FMT, newWorkbook, styleHeader } from '../common/excel';
import { TRANSACTION_TYPE_LABEL } from '../common/labels';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsQuery } from './finance.dto';
import { FinanceService, TRANSACTION_INCLUDE } from './finance.service';
import { LOCALE } from '../common/locale';

const fmtDay = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
const num = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : 0);

/** Título del reporte: la sede filtrada, o el conjunto completo que el usuario puede ver. */
function campusLabel(requested: string | undefined, accounts: { campus: { id: string; name: string } | null }[], transactions: { account: { campus: { id: string; name: string } | null } }[]) {
  if (requested === NO_CAMPUS) return 'Cuentas generales';
  if (!requested) return 'Todas';
  return [...accounts.map((a) => a.campus), ...transactions.map((t) => t.account.campus)].find((c) => c?.id === requested)?.name ?? '—';
}

@Injectable()
export class FinanceExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  async build(churchId: string, scope: CampusScope, q: Partial<TransactionsQuery>) {
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId } });
    const where = this.finance.transactionWhere(churchId, scope, q);
    const [transactions, summary] = await Promise.all([
      this.prisma.transaction.findMany({ where, include: TRANSACTION_INCLUDE, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
      this.finance.summary(churchId, scope, { from: q.from, to: q.to, currency: q.currency, campusId: q.campusId }),
    ]);

    const wb = newWorkbook();
    const period = q.from || q.to ? `${fmtDay(q.from) || 'inicio'} al ${fmtDay(q.to) || 'hoy'}` : 'Todos los movimientos';

    // 1. Resumen
    const ws = wb.addWorksheet('Resumen');
    ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }];
    ws.addRow([church.name]).font = { bold: true, size: 16 };
    ws.addRow(['Reporte financiero']).font = { size: 12, color: { argb: 'FF57534E' } };
    ws.addRow([`Período: ${period}`]);
    if (church.campusesEnabled) ws.addRow([`Sede: ${campusLabel(q.campusId, summary.accounts, transactions)}`]);
    ws.addRow([`Generado: ${new Date().toLocaleString(LOCALE, { timeZone: church.timezone })}`]);
    ws.addRow([]);
    styleHeader(ws.addRow(['Moneda', 'Ingresos', 'Egresos', 'Resultado']));
    for (const [currency, t] of Object.entries(summary.totals)) {
      const r = ws.addRow([currency, num(t.income), num(t.expense), num(t.net)]);
      [2, 3, 4].forEach((c) => (r.getCell(c).numFmt = MONEY_FMT));
    }
    if (!Object.keys(summary.totals).length) ws.addRow(['Sin movimientos en el período']);
    ws.addRow([]);
    styleHeader(ws.addRow(['Cuenta', 'Moneda', 'Saldo actual', 'Estado', ...(church.campusesEnabled ? ['Sede'] : [])]));
    for (const a of summary.accounts) {
      const r = ws.addRow([a.name, a.currency, num(a.balance), a.active ? 'Activa' : 'Inactiva', ...(church.campusesEnabled ? [a.campus?.name ?? 'General'] : [])]);
      r.getCell(3).numFmt = MONEY_FMT;
    }

    // 2. Movimientos
    const movements = addTableSheet(
      wb,
      'Movimientos',
      [
        { header: 'Fecha', key: 'date', width: 12, numFmt: DATE_FMT },
        { header: 'Tipo', key: 'type', width: 10 },
        { header: 'Categoría', key: 'category', width: 22 },
        { header: 'Cuenta', key: 'account', width: 18 },
        { header: 'Moneda', key: 'currency', width: 9 },
        { header: 'Ingreso', key: 'income', width: 15, numFmt: MONEY_FMT },
        { header: 'Egreso', key: 'expense', width: 15, numFmt: MONEY_FMT },
        { header: 'Miembro', key: 'member', width: 24 },
        { header: 'Descripción', key: 'description', width: 36 },
        { header: 'Referencia', key: 'reference', width: 16 },
        { header: 'Registrado por', key: 'createdBy', width: 20 },
        ...(church.campusesEnabled ? [{ header: 'Sede', key: 'campus', width: 20 }] : []),
      ],
      transactions.map((t) => ({
        date: t.date,
        type: TRANSACTION_TYPE_LABEL[t.type],
        category: t.category.name,
        account: t.account.name,
        currency: t.account.currency,
        income: t.type === 'INCOME' ? num(t.amount) : null,
        expense: t.type === 'EXPENSE' ? num(t.amount) : null,
        member: t.member ? `${t.member.lastName}, ${t.member.firstName}` : '',
        description: t.description ?? '',
        reference: t.reference ?? '',
        createdBy: t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : '',
        campus: t.account.campus?.name ?? 'General',
      })),
    );
    if (transactions.length) {
      const currencies = [...new Set(transactions.map((t) => t.account.currency))];
      const last = transactions.length + 1;
      movements.addRow([]);
      for (const c of currencies) {
        const r = movements.addRow({
          category: `Total ${c}`,
          income: { formula: `SUMIFS(F2:F${last},E2:E${last},"${c}")` },
          expense: { formula: `SUMIFS(G2:G${last},E2:E${last},"${c}")` },
        });
        r.font = { bold: true };
      }
    }

    // 3. Por categoría
    const incomeTotals = new Map<Currency, number>();
    const expenseTotals = new Map<Currency, number>();
    for (const c of summary.byCategory) {
      const m = c.type === 'INCOME' ? incomeTotals : expenseTotals;
      m.set(c.currency, (m.get(c.currency) ?? 0) + num(c.total));
    }
    addTableSheet(
      wb,
      'Por categoría',
      [
        { header: 'Tipo', key: 'type', width: 10 },
        { header: 'Categoría', key: 'name', width: 26 },
        { header: 'Moneda', key: 'currency', width: 9 },
        { header: 'Movimientos', key: 'count', width: 13 },
        { header: 'Total', key: 'total', width: 16, numFmt: MONEY_FMT },
        { header: '% del tipo', key: 'pct', width: 12, numFmt: '0.0%' },
      ],
      [...summary.byCategory]
        .sort((a, b) => a.type.localeCompare(b.type) || b.total.comparedTo(a.total))
        .map((c) => {
          const base = (c.type === 'INCOME' ? incomeTotals : expenseTotals).get(c.currency) || 1;
          return { ...c, type: TRANSACTION_TYPE_LABEL[c.type], total: num(c.total), pct: num(c.total) / base };
        }),
    );

    // 4. Por mes
    const months = new Map<string, { month: string; currency: Currency; income: number; expense: number }>();
    for (const m of summary.monthly) {
      const key = `${m.month}:${m.currency}`;
      const e = months.get(key) ?? { month: m.month, currency: m.currency, income: 0, expense: 0 };
      if (m.type === 'INCOME') e.income += num(m.total);
      else e.expense += num(m.total);
      months.set(key, e);
    }
    addTableSheet(
      wb,
      'Por mes',
      [
        { header: 'Mes', key: 'month', width: 12 },
        { header: 'Moneda', key: 'currency', width: 9 },
        { header: 'Ingresos', key: 'income', width: 16, numFmt: MONEY_FMT },
        { header: 'Egresos', key: 'expense', width: 16, numFmt: MONEY_FMT },
        { header: 'Resultado', key: 'net', width: 16, numFmt: MONEY_FMT },
      ],
      [...months.values()].map((m) => ({ ...m, net: m.income - m.expense })),
    );

    // 5. Diezmos por miembro
    const tithes = new Map<string, { member: string; currency: Currency; count: number; total: number }>();
    for (const t of transactions) {
      if (!t.category.isTithe || t.type !== 'INCOME') continue;
      const name = t.member ? `${t.member.lastName}, ${t.member.firstName}` : 'Sin asignar';
      const key = `${name}:${t.account.currency}`;
      const e = tithes.get(key) ?? { member: name, currency: t.account.currency, count: 0, total: 0 };
      e.count += 1;
      e.total += num(t.amount);
      tithes.set(key, e);
    }
    addTableSheet(
      wb,
      'Diezmos por miembro',
      [
        { header: 'Miembro', key: 'member', width: 28 },
        { header: 'Moneda', key: 'currency', width: 9 },
        { header: 'Aportes', key: 'count', width: 10 },
        { header: 'Total', key: 'total', width: 16, numFmt: MONEY_FMT },
      ],
      [...tithes.values()].sort((a, b) => a.member.localeCompare(b.member)),
    );

    const suffix = q.from || q.to ? `${q.from ?? 'inicio'}_${q.to ?? 'hoy'}` : new Date().toISOString().slice(0, 10);
    return { wb, filename: `finanzas-${church.slug}-${suffix}.xlsx` };
  }
}
