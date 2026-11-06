import { Module } from '@nestjs/common';
import { AgreementsService } from './agreements.service';
import { DeletionService } from './deletion.service';
import { LegalController } from './legal.controller';

@Module({
  controllers: [LegalController],
  providers: [AgreementsService, DeletionService],
  exports: [AgreementsService],
})
export class LegalModule {}
