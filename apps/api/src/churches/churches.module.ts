import { Module } from '@nestjs/common';
import { ChurchRequestsController } from './church-requests.controller';
import { ChurchRequestsService } from './church-requests.service';
import { ChurchesController } from './churches.controller';
import { ChurchesService } from './churches.service';
import { RegistrationsService } from './registrations.service';

@Module({
  controllers: [ChurchesController, ChurchRequestsController],
  providers: [ChurchesService, ChurchRequestsService, RegistrationsService],
})
export class ChurchesModule {}
