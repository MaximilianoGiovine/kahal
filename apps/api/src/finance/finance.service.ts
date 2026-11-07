import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma, TransactionType } from '@prisma/client';
import { assertAssignableCampus, assertCampusInScope, campusFilter, campusForNew, CampusScope, campusSql } from '../common/campus-scope';
import { paginate } from '../common/pagination';
import { parseDay } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { AccountDto, CategoryDto, RangeQuery, TransactionDto, TransactionsQuery } from './finance.dto';

const D = Prisma.Decimal;

export const TRANSACTION_INCLUDE = {
  account: { select: { id: true, name: true, currency: true, campus: { select: { id: true, name: true } } } },
  category: { select: { id: true, name: true, color: true, isTithe: true } },
  member: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TransactionInclude;

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // Cuentas

  async accounts(churchId: string, scope: CampusScope, requested?: string) {
    const campusId = campusFilter(scope, requested);
    const [accounts, sums] = await Promise.all([
      this.prisma.financeAccount.findMany({
        where: { churchId, campusId },
        include: { campus: { select: { id: true, name: true } } },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.transaction.groupBy({ by: ['accountId', 'type'], where: { churchId, account: { campusId } }, _sum: { amount: true } }),
    ]);
    return accounts.map((a) => {
      const income = sums.find((s) => s.accountId === a.id && s.type === 'INCOME')?._sum.amount ?? new D(0);
      const expense = sums.find((s) => s.accountId === a.id && s.type === 'EXPENSE')?._sum.amount ?? new D(0);
      return { ...a, balance: a.initialBalance.plus(income).minus(expense) };
    });
  }

  async createAccount(churchId: string, scope: CampusScope, dto: AccountDto) {
    const campusId = campusForNew(scope, dto.campusId);
    await assertAssignableCampus(this.prisma, churchId, campusId);
    try {
      return await this.prisma.financeAccount.create({ data: { ...dto, campusId, churchId } });
    } catch (e) {
      throw uniqueError(e, 'Ya existe una cuenta con ese nombre');
    }
  }

  async updateAccount(churchId: string, scope: CampusScope, id: string, dto: AccountDto) {
    const account = await this.prisma.financeAccount.findFirst({ where: { id, churchId, campusId: campusFilter(scope) }, include: { _count: { select: { transactions: true } } } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (dto.currency && dto.currency !== account.currency && account._count.transactions > 0) {
      throw new BadRequestException('No se puede cambiar la moneda de una cuenta con movimientos');
    }
    if (dto.campusId !== undefined && dto.campusId !== account.campusId) {
      assertCampusInScope(scope, dto.campusId);
      await assertAssignableCampus(this.prisma, churchId, dto.campusId, account.campusId);
    }
    try {
      return await this.prisma.financeAccount.update({ where: { id }, data: dto });
    } catch (e) {
      throw uniqueError(e, 'Ya existe una cuenta con ese nombre');
    }
  }

  // Categorías

  categories(churchId: string, scope: CampusScope) {
    const campusId = campusFilter(scope);
    return this.prisma.financeCategory.findMany({
      where: { churchId },
      orderBy: [{ type: 'asc' }, { active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { transactions: { where: { account: { campusId } } } } } },
    });
  }

  async createCategory(churchId: string, dto: CategoryDto) {
    try {
      return await this.prisma.financeCategory.create({ data: { ...dto, churchId } });
    } catch (e) {
      throw uniqueError(e, 'Ya existe una categoría con ese nombre');
    }
  }

  async updateCategory(churchId: string, id: string, dto: CategoryDto) {
    const category = await this.prisma.financeCategory.findFirst({ where: { id, churchId }, include: { _count: { select: { transactions: true } } } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    if (dto.type !== category.type && category._count.transactions > 0) {
      throw new BadRequestException('No se puede cambiar el tipo de una categoría con movimientos');
    }
    try {
      return await this.prisma.financeCategory.update({ where: { id }, data: dto });
    } catch (e) {
      throw uniqueError(e, 'Ya existe una categoría con ese nombre');
    }
  }

  // Movimientos

  transactionWhere(churchId: string, scope: CampusScope, q: Partial<TransactionsQuery>): Prisma.TransactionWhereInput {
    const campusId = campusFilter(scope, q.campusId);
    return {
      churchId,
      type: q.type,
      accountId: q.accountId,
      categoryId: q.categoryId,
      memberId: q.memberId,
      account: { currency: q.currency, campusId },
      date: { gte: q.from ? parseDay(q.from) : undefined, lte: q.to ? parseDay(q.to) : undefined },
      ...(q.q && {
        OR: [
          { description: { contains: q.q, mode: 'insensitive' } },
          { reference: { contains: q.q, mode: 'insensitive' } },
          { member: { lastName: { contains: q.q, mode: 'insensitive' } } },
          { member: { firstName: { contains: q.q, mode: 'insensitive' } } },
        ],
      }),
    };
  }

  async transactions(churchId: string, scope: CampusScope, q: TransactionsQuery) {
    const where = this.transactionWhere(churchId, scope, q);
    const [items, total, sums] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: TRANSACTION_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        ...paginate(q),
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.groupBy({ by: ['type'], where, _sum: { amount: true } }),
    ]);
    const income = sums.find((s) => s.type === 'INCOME')?._sum.amount ?? new D(0);
    const expense = sums.find((s) => s.type === 'EXPENSE')?._sum.amount ?? new D(0);
    return { items, total, page: q.page, pageSize: q.pageSize, totals: { income, expense, net: income.minus(expense) } };
  }

  async createTransaction(churchId: string, scope: CampusScope, memberScope: CampusScope, userId: string, dto: TransactionDto) {
    const type = await this.validateRefs(churchId, scope, memberScope, dto);
    return this.prisma.transaction.create({
      data: { ...dto, type, date: parseDay(dto.date.slice(0, 10)), churchId, createdById: userId },
      include: TRANSACTION_INCLUDE,
    });
  }

  async updateTransaction(churchId: string, scope: CampusScope, memberScope: CampusScope, id: string, dto: TransactionDto) {
    const current = await this.ensureTransaction(churchId, scope, id);
    const type = await this.validateRefs(churchId, scope, memberScope, dto, current.memberId);
    return this.prisma.transaction.update({
      where: { id },
      data: { ...dto, type, date: parseDay(dto.date.slice(0, 10)) },
      include: TRANSACTION_INCLUDE,
    });
  }

  async removeTransaction(churchId: string, scope: CampusScope, id: string) {
    await this.ensureTransaction(churchId, scope, id);
    await this.prisma.transaction.delete({ where: { id } });
    return { ok: true };
  }

  // Resumen

  async summary(churchId: string, scope: CampusScope, q: RangeQuery) {
    const where = this.transactionWhere(churchId, scope, q);
    const [byCategory, categories, accounts, monthly] = await Promise.all([
      this.prisma.transaction.groupBy({ by: ['categoryId', 'type', 'accountId'], where, _sum: { amount: true }, _count: true }),
      this.prisma.financeCategory.findMany({ where: { churchId }, select: { id: true, name: true, color: true } }),
      this.accounts(churchId, scope, q.campusId),
      this.monthly(churchId, scope, q),
    ]);

    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
    const totals: Record<string, { income: Prisma.Decimal; expense: Prisma.Decimal; net: Prisma.Decimal }> = {};
    const catMap = new Map<string, { categoryId: string; name: string; color: string | null; type: TransactionType; currency: Currency; total: Prisma.Decimal; count: number }>();

    for (const row of byCategory) {
      const currency = currencyOf.get(row.accountId) ?? 'ARS';
      const amount = row._sum.amount ?? new D(0);
      const t = (totals[currency] ??= { income: new D(0), expense: new D(0), net: new D(0) });
      if (row.type === 'INCOME') t.income = t.income.plus(amount);
      else t.expense = t.expense.plus(amount);
      t.net = t.income.minus(t.expense);

      const key = `${row.categoryId}:${currency}`;
      const cat = categories.find((c) => c.id === row.categoryId);
      const entry = catMap.get(key) ?? { categoryId: row.categoryId, name: cat?.name ?? '—', color: cat?.color ?? null, type: row.type, currency, total: new D(0), count: 0 };
      entry.total = entry.total.plus(amount);
      entry.count += row._count;
      catMap.set(key, entry);
    }

    return {
      totals,
      byCategory: [...catMap.values()].sort((a, b) => b.total.comparedTo(a.total)),
      accounts,
      monthly,
    };
  }

  /** Ingresos/egresos por mes y moneda. Sin rango: últimos 12 meses. */
  async monthly(churchId: string, scope: CampusScope, q: RangeQuery) {
    const to = q.to ? parseDay(q.to) : new Date();
    const from = q.from ? parseDay(q.from) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
    const rows = await this.prisma.$queryRaw<{ month: Date; type: TransactionType; currency: Currency; total: Prisma.Decimal }[]>`
      SELECT date_trunc('month', t."date") AS month, t."type", a."currency", SUM(t."amount") AS total
      FROM "Transaction" t JOIN "FinanceAccount" a ON a."id" = t."accountId"
      WHERE t."churchId" = ${churchId} AND t."date" >= ${from} AND t."date" <= ${to} ${campusSql(scope, q.campusId)}
      GROUP BY 1, 2, 3 ORDER BY 1`;
    return rows.map((r) => ({ month: r.month.toISOString().slice(0, 7), type: r.type, currency: r.currency, total: r.total }));
  }

  // Helpers

  /** `currentMemberId`: el aporte ya asociado se conserva aunque la persona sea de otra sede. */
  private async validateRefs(churchId: string, scope: CampusScope, memberScope: CampusScope, dto: TransactionDto, currentMemberId?: string | null): Promise<TransactionType> {
    const [account, category] = await Promise.all([
      this.prisma.financeAccount.findFirst({ where: { id: dto.accountId, churchId, campusId: campusFilter(scope) } }),
      this.prisma.financeCategory.findFirst({ where: { id: dto.categoryId, churchId } }),
    ]);
    if (!account) throw new BadRequestException('Cuenta inválida');
    if (!category) throw new BadRequestException('Categoría inválida');
    const memberCampus = dto.memberId === currentMemberId ? undefined : campusFilter(memberScope);
    if (dto.memberId && !(await this.prisma.member.findFirst({ where: { id: dto.memberId, churchId, campusId: memberCampus } }))) {
      throw new BadRequestException('Miembro inválido');
    }
    return category.type;
  }

  private async ensureTransaction(churchId: string, scope: CampusScope, id: string) {
    const transaction = await this.prisma.transaction.findFirst({ where: { id, churchId, account: { campusId: campusFilter(scope) } } });
    if (!transaction) throw new NotFoundException('Movimiento no encontrado');
    return transaction;
  }
}

function uniqueError(e: unknown, message: string) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException(message);
  return e;
}
