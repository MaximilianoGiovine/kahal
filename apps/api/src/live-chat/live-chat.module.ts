import { Module } from '@nestjs/common';
import { LiveChatController } from './live-chat.controller';
import { LiveChatHub } from './live-chat.hub';
import { LiveChatService } from './live-chat.service';

@Module({
  controllers: [LiveChatController],
  providers: [LiveChatService, LiveChatHub],
  exports: [LiveChatService],
})
export class LiveChatModule {}
