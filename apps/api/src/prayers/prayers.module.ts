import { Module } from '@nestjs/common';
import { PrayersController } from './prayers.controller';
import { PrayersService } from './prayers.service';

@Module({
  controllers: [PrayersController],
  providers: [PrayersService],
})
export class PrayersModule {}
