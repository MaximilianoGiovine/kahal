import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { Request, Response } from 'express';
import { clearSessionCookies } from '../auth/auth-cookies';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, Public, RequirePermissions, SuperAdminOnly } from '../common/decorators';
import { AgreementsService } from './agreements.service';
import { DeletionService } from './deletion.service';
import { LEGAL_DOCUMENTS } from './documents';
import { DeleteAccountDto, ScheduleChurchDeletionDto } from './legal.dto';

@Controller()
export class LegalController {
  constructor(
    private readonly agreements: AgreementsService,
    private readonly deletion: DeletionService,
  ) {}

  @Public()
  @Get('public/legal/:document')
  document(@Param('document') document: string) {
    if (document !== 'privacy' && document !== 'contract') throw new NotFoundException('Documento no encontrado');
    return LEGAL_DOCUMENTS[document];
  }

  @SuperAdminOnly()
  @Get('admin/agreements')
  listAgreements() {
    return this.agreements.list();
  }

  @SuperAdminOnly()
  @Get('admin/agreements/:id')
  agreement(@Param('id') id: string) {
    return this.agreements.get(id);
  }

  @SuperAdminOnly()
  @Get('admin/agreements/:id/pdf')
  agreementPdf(@Param('id') id: string, @Res() res: Response) {
    return this.agreements.sendPdf(id, res);
  }

  @Post('account/delete')
  @HttpCode(200)
  async deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.deletion.deleteOwnAccount(user, dto);
    clearSessionCookies(req, res);
    return { ok: true };
  }

  @RequirePermissions(Permission.USERS_MANAGE)
  @Delete('users/:id')
  async deleteUser(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.deletion.deleteChurchUser(churchId, user, id);
    return { ok: true };
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Post('church/deletion')
  scheduleDeletion(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Body() dto: ScheduleChurchDeletionDto) {
    return this.deletion.scheduleChurchDeletion(churchId, user, dto);
  }

  @RequirePermissions(Permission.CHURCH_SETTINGS)
  @Delete('church/deletion')
  cancelDeletion(@ChurchId() churchId: string, @CurrentUser() user: AuthUser) {
    return this.deletion.cancelChurchDeletion(churchId, user);
  }

  @SuperAdminOnly()
  @Post('admin/churches/:id/deletion')
  adminScheduleDeletion(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ScheduleChurchDeletionDto) {
    return this.deletion.scheduleChurchDeletion(id, user, dto);
  }

  @SuperAdminOnly()
  @Delete('admin/churches/:id/deletion')
  adminCancelDeletion(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.deletion.cancelChurchDeletion(id, user);
  }
}
