import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser, FINANCE_READ_ROLES, FINANCE_ROLES } from '../common/auth-user';
import { ChurchId, CurrentUser, Roles } from '../common/decorators';
import { sendWorkbook } from '../common/excel';
import { AccountDto, CategoryDto, RangeQuery, TransactionDto, TransactionsQuery } from './finance.dto';
import { FinanceExportService } from './finance-export.service';
import { FinanceService } from './finance.service';

@Roles(...FINANCE_READ_ROLES)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly exporter: FinanceExportService,
  ) {}

  @Get('accounts')
  accounts(@ChurchId() churchId: string) {
    return this.finance.accounts(churchId);
  }

  @Roles(...FINANCE_ROLES)
  @Post('accounts')
  createAccount(@ChurchId() churchId: string, @Body() dto: AccountDto) {
    return this.finance.createAccount(churchId, dto);
  }

  @Roles(...FINANCE_ROLES)
  @Patch('accounts/:id')
  updateAccount(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: AccountDto) {
    return this.finance.updateAccount(churchId, id, dto);
  }

  @Get('categories')
  categories(@ChurchId() churchId: string) {
    return this.finance.categories(churchId);
  }

  @Roles(...FINANCE_ROLES)
  @Post('categories')
  createCategory(@ChurchId() churchId: string, @Body() dto: CategoryDto) {
    return this.finance.createCategory(churchId, dto);
  }

  @Roles(...FINANCE_ROLES)
  @Patch('categories/:id')
  updateCategory(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: CategoryDto) {
    return this.finance.updateCategory(churchId, id, dto);
  }

  @Get('transactions')
  transactions(@ChurchId() churchId: string, @Query() q: TransactionsQuery) {
    return this.finance.transactions(churchId, q);
  }

  @Roles(...FINANCE_ROLES)
  @Post('transactions')
  createTransaction(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: TransactionDto) {
    return this.finance.createTransaction(churchId, user.id, dto);
  }

  @Roles(...FINANCE_ROLES)
  @Patch('transactions/:id')
  updateTransaction(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: TransactionDto) {
    return this.finance.updateTransaction(churchId, id, dto);
  }

  @Roles(...FINANCE_ROLES)
  @Delete('transactions/:id')
  removeTransaction(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.finance.removeTransaction(churchId, id);
  }

  @Get('summary')
  summary(@ChurchId() churchId: string, @Query() q: RangeQuery) {
    return this.finance.summary(churchId, q);
  }

  @Get('export')
  async export(@ChurchId() churchId: string, @Query() q: TransactionsQuery, @Res() res: Response) {
    const { wb, filename } = await this.exporter.build(churchId, q);
    await sendWorkbook(res, wb, filename);
  }
}
