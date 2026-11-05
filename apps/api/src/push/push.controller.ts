import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators';
import { SubscribeDto, UnsubscribeDto } from './push.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  config() {
    return { publicKey: this.push.publicKey };
  }

  @Post('subscribe')
  @HttpCode(200)
  async subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    await this.push.subscribe(user.id, { endpoint: dto.endpoint, ...dto.keys });
    return { ok: true };
  }

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    await this.push.unsubscribe(user.id, dto.endpoint);
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser() user: AuthUser) {
    await this.push.sendToUsers([user.id], {
      title: 'Kahal',
      body: '¡Las notificaciones funcionan en este dispositivo!',
      url: '/app/perfil',
      tag: 'test',
    });
    return { ok: true };
  }
}
