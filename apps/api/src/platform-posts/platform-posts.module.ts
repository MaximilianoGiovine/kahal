import { Module } from '@nestjs/common';
import { PlatformPostsController } from './platform-posts.controller';
import { PlatformPostsService } from './platform-posts.service';

@Module({
  controllers: [PlatformPostsController],
  providers: [PlatformPostsService],
})
export class PlatformPostsModule {}
