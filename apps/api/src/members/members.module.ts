import { Module } from '@nestjs/common';
import { MembersExportService } from './members-export.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  controllers: [MembersController],
  providers: [MembersService, MembersExportService],
})
export class MembersModule {}
