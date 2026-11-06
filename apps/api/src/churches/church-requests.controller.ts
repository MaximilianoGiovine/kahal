import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public, SuperAdminOnly } from '../common/decorators';
import { ApproveChurchRequestDto, RejectChurchRequestDto, SubmitChurchRequestDto } from './church-requests.dto';
import { ChurchRequestsService } from './church-requests.service';

@Controller()
export class ChurchRequestsController {
  constructor(private readonly requests: ChurchRequestsService) {}

  /** Público: cada envío le manda un email al super admin, por eso el límite es bajo. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @Post('public/church-requests')
  submit(@Body() dto: SubmitChurchRequestDto, @Req() req: Request) {
    return this.requests.submit(dto, { ipAddress: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300) });
  }

  @SuperAdminOnly()
  @Get('admin/church-requests')
  list() {
    return this.requests.list();
  }

  /** Construye la iglesia con los datos guardados del formulario. */
  @SuperAdminOnly()
  @Post('admin/church-requests/:id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body() dto: ApproveChurchRequestDto, @CurrentUser() user: AuthUser) {
    return this.requests.approve(id, dto, user.id);
  }

  @SuperAdminOnly()
  @Post('admin/church-requests/:id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: RejectChurchRequestDto, @CurrentUser() user: AuthUser) {
    return this.requests.reject(id, dto, user.id);
  }
}
