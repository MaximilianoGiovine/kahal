import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { AllowWhenBlocked, ChurchId, CurrentUser, Public, RequirePermissions, SuperAdminOnly } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { AdminBillingUpdateDto, RecordDonationDto } from './billing.dto';
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

  /** El formulario de alta ofrece coordinar la donación por WhatsApp antes de tener cuenta. */
  @Public()
  @Get('public/billing/contact')
  contact() {
    return this.billing.contact();
  }

  // --- Super admin: todas las iglesias ---

  @SuperAdminOnly()
  @Get('admin/billing')
  adminOverview() {
    return this.billing.adminOverview();
  }

  @SuperAdminOnly()
  @Get('admin/billing/churches/:id/donations')
  adminHistory(@Param('id') id: string) {
    return this.billing.adminHistory(id);
  }

  @SuperAdminOnly()
  @Post('admin/billing/churches/:id/donations')
  recordDonation(@Param('id') id: string, @Body() dto: RecordDonationDto, @CurrentUser() user: AuthUser) {
    return this.billing.recordDonation(id, dto, user.id);
  }

  /** Corrige el historial: no cambia la fecha de activación. */
  @SuperAdminOnly()
  @Delete('admin/billing/churches/:id/donations/:donationId')
  deleteDonation(@Param('id') id: string, @Param('donationId') donationId: string) {
    return this.billing.deleteDonation(id, donationId);
  }

  @SuperAdminOnly()
  @Patch('admin/billing/churches/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: AdminBillingUpdateDto) {
    return this.billing.adminUpdate(id, dto);
  }
}
