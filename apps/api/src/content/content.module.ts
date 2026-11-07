import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { FacebookPageController } from './facebook-page.controller';
import { FacebookPageService } from './facebook-page.service';
import { LiveDetectorService } from './live-detector.service';
import { FacebookLive, TwitchLive, YouTubeLive } from './live-platforms';

@Module({
  imports: [BillingModule],
  controllers: [ContentController, FacebookPageController],
  providers: [ContentService, LiveDetectorService, FacebookPageService, YouTubeLive, TwitchLive, FacebookLive],
})
export class ContentModule {}
