import { Module } from '@nestjs/common';
import { FinanceExportService } from './finance-export.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceExportService],
})
export class FinanceModule {}
