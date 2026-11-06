import { Body, Controller, Get, Headers, HttpCode, Post, Query, RawBodyRequest, Req } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AllowWhenBlocked, ChurchId, Public, RequirePermissions } from '../common/decorators';
import { CheckoutDto } from './billing.dto';
import { BillingService } from './billing.service';

@AllowWhenBlocked()
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Para cualquier usuario: la app muestra el bloqueo también a los miembros. */
  @Get('billing/access')
  access(@ChurchId() churchId: string) {
    return this.billing.access(churchId);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Get('billing')
  overview(@ChurchId() churchId: string) {
    return this.billing.overview(churchId);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('billing/checkout')
  checkout(@ChurchId() churchId: string, @Body() dto: CheckoutDto) {
    return this.billing.checkout(churchId, dto);
  }

  /** Al volver de la pasarela, sin esperar a que llegue su aviso. */
  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('billing/refresh')
  @HttpCode(200)
  refresh(@ChurchId() churchId: string) {
    return this.billing.refresh(churchId);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Post('billing/cancel')
  @HttpCode(200)
  async cancel(@ChurchId() churchId: string) {
    await this.billing.cancelForChurch(churchId);
    return this.billing.overview(churchId);
  }

  @Public()
  @Post('public/billing/webhooks/mercadopago')
  @HttpCode(200)
  async mercadoPago(
    @Query('data.id') dataId: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: { type?: string },
  ) {
    await this.billing.handleMercadoPago({ dataId, requestId, signature, type: body?.type });
    return { ok: true };
  }

  @Public()
  @Post('public/billing/webhooks/paypal')
  @HttpCode(200)
  async payPal(@Req() req: RawBodyRequest<Request>) {
    await this.billing.handlePayPal(req.headers, req.rawBody);
    return { ok: true };
  }
}
