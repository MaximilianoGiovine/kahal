import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AgreementsService } from './agreements.service';
import { DeletionService } from './deletion.service';
import { LegalController } from './legal.controller';

@Module({
  imports: [BillingModule],
  controllers: [LegalController],
  providers: [AgreementsService, DeletionService],
  exports: [AgreementsService],
})
export class LegalModule {}
