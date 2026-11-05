import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushProcessor } from './push.processor';
import { PUSH_QUEUE, PushService } from './push.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: PUSH_QUEUE })],
  controllers: [PushController],
  providers: [PushService, PushProcessor],
  exports: [PushService],
})
export class PushModule {}
