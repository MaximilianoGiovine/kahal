import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

@Module({
  controllers: [AuthController, OAuthController],
  providers: [AuthService, OAuthService],
})
export class AuthModule {}
