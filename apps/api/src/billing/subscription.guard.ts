import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../common/auth-user';
import { ALLOW_WHEN_BLOCKED, IS_PUBLIC } from '../common/decorators';
import { BillingService } from './billing.service';

/** Sin suscripción vigente, la iglesia solo conserva lo necesario para pagar y para ejercer derechos sobre sus cuentas. */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_BLOCKED, targets)) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || user.isSuperAdmin || !user.churchId) return true;
    if (!(await this.billing.isBlocked(user.churchId))) return true;
    throw new HttpException({ statusCode: HttpStatus.PAYMENT_REQUIRED, code: 'SUBSCRIPTION_REQUIRED', message: 'Tu iglesia necesita una suscripción activa para usar Kahal' }, HttpStatus.PAYMENT_REQUIRED);
  }
}
