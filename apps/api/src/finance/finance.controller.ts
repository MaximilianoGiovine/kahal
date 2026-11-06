import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Permission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { assertWholeChurch, CampusScope } from '../common/campus-scope';
import { ChurchId, CurrentUser, RequirePermissions, UserCampusScope } from '../common/decorators';
import { sendWorkbook } from '../common/excel';
import { AccountDto, AccountsQuery, CategoryDto, RangeQuery, TransactionDto, TransactionsQuery } from './finance.dto';
import { FinanceExportService } from './finance-export.service';
import { FinanceService } from './finance.service';

@RequirePermissions(Permission.FINANCE_VIEW)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly exporter: FinanceExportService,
  ) {}

  @Get('accounts')
  accounts(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Query() q: AccountsQuery) {
    return this.finance.accounts(churchId, scope, q.campusId);
  }

  @RequirePermissions(Permission.FINANCE_EDIT)
  @Post('accounts')
  createAccount(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Body() dto: AccountDto) {
    return this.finance.createAccount(churchId, scope, dto);
  }

  @RequirePermissions(Permission.FINANCE_EDIT)
  @Patch('accounts/:id')
  updateAccount(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string, @Body() dto: AccountDto) {
    return this.finance.updateAccount(churchId, scope, id, dto);
  }

  @Get('categories')
  categories(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope) {
    return this.finance.categories(churchId, scope);
  }

  @RequirePermissions(Permission.FINANCE_EDIT)
  @Post('categories')
  createCategory(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Body() dto: CategoryDto) {
    assertWholeChurch(scope);
    return this.finance.createCategory(churchId, dto);
  }

  @RequirePermissions(Permission.FINANCE_EDIT)
  @Patch('categories/:id')
  updateCategory(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string, @Body() dto: CategoryDto) {
    assertWholeChurch(scope);
    return this.finance.updateCategory(churchId, id, dto);
  }

  @Get('transactions')
  transactions(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Query() q: TransactionsQuery) {
    return this.finance.transactions(churchId, scope, q);
  }

  @RequirePermissions(Permission.FINANCE_EDIT)
  @Post('transactions')
  createTransaction(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: TransactionDto) {
    return this.finance.createTransaction(churchId, user.campusScope, user.id, dto);
  }

  @RequirePermissions(Permission.FINANCE_EDIT)
  @Patch('transactions/:id')
  updateTransaction(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string, @Body() dto: TransactionDto) {
    return this.finance.updateTransaction(churchId, scope, id, dto);
  }

  @RequirePermissions(Permission.FINANCE_EDIT)
  @Delete('transactions/:id')
  removeTransaction(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Param('id') id: string) {
    return this.finance.removeTransaction(churchId, scope, id);
  }

  @Get('summary')
  summary(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Query() q: RangeQuery) {
    return this.finance.summary(churchId, scope, q);
  }

  @Get('export')
  async export(@ChurchId() churchId: string, @UserCampusScope() scope: CampusScope, @Query() q: TransactionsQuery, @Res() res: Response) {
    const { wb, filename } = await this.exporter.build(churchId, scope, q);
    await sendWorkbook(res, wb, filename);
  }
}
