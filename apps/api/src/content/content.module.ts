import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { LiveDetectorService } from './live-detector.service';
import { TwitchLive, YouTubeLive } from './live-platforms';

@Module({
  imports: [BillingModule],
  controllers: [ContentController],
  providers: [ContentService, LiveDetectorService, YouTubeLive, TwitchLive],
})
export class ContentModule {}
