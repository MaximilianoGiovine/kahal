import { Module } from '@nestjs/common';
import { InstagramClient } from './instagram.client';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';

@Module({
  controllers: [InstagramController],
  providers: [InstagramService, InstagramClient],
})
export class InstagramModule {}
