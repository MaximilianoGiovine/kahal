import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [BillingModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
