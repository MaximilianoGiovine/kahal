import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MercadoPagoGateway, PayPalGateway } from './gateways';

@Module({
  controllers: [BillingController],
  providers: [BillingService, MercadoPagoGateway, PayPalGateway],
  exports: [BillingService],
})
export class BillingModule {}
