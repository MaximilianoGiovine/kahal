import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { ChurchId, CurrentUser, RequirePermissions } from '../common/decorators';
import { sendWorkbook } from '../common/excel';
import { FamilyDto, MemberDto, MembersQuery, MemberStatusDto, MinistryDto, ReorderDto } from './members.dto';
import { MembersExportService } from './members-export.service';
import { MembersService } from './members.service';

@RequirePermissions(Permission.MEMBERS_VIEW)
@Controller()
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly exporter: MembersExportService,
  ) {}

  @Get('members')
  list(@ChurchId() churchId: string, @Query() query: MembersQuery) {
    return this.members.list(churchId, query);
  }

  /** Búsqueda mínima (nombre y documento) para asociar diezmos: la usa también Tesorería. */
  @RequirePermissions(Permission.MEMBERS_VIEW, Permission.FINANCE_EDIT)
  @Get('members/lookup')
  lookup(@ChurchId() churchId: string, @Query('q') q = '') {
    return this.members.lookup(churchId, q);
  }

  @Get('members/stats')
  stats(@ChurchId() churchId: string) {
    return this.members.stats(churchId);
  }

  @Get('members/export')
  async export(@ChurchId() churchId: string, @Query() query: MembersQuery, @Res() res: Response) {
    const { wb, filename } = await this.exporter.build(churchId, query);
    await sendWorkbook(res, wb, filename);
  }

  @Get('members/:id')
  get(@ChurchId() churchId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.get(churchId, id, user);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Post('members')
  create(@ChurchId() churchId: string, @Body() dto: MemberDto) {
    return this.members.create(churchId, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Patch('members/:id')
  update(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: MemberDto) {
    return this.members.update(churchId, id, dto);
  }

  @RequirePermissions(Permission.MEMBERS_DELETE)
  @Delete('members/:id')
  remove(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.members.remove(churchId, id);
  }

  @Get('families')
  families(@ChurchId() churchId: string) {
    return this.members.families(churchId);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Post('families')
  createFamily(@ChurchId() churchId: string, @Body() dto: FamilyDto) {
    return this.members.createFamily(churchId, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Patch('families/:id')
  updateFamily(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: FamilyDto) {
    return this.members.updateFamily(churchId, id, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Delete('families/:id')
  removeFamily(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.members.removeFamily(churchId, id);
  }

  @Get('member-statuses')
  memberStatuses(@ChurchId() churchId: string) {
    return this.members.memberStatuses(churchId);
  }

  @RequirePermissions(Permission.MEMBER_STATUSES_MANAGE)
  @Post('member-statuses')
  createMemberStatus(@ChurchId() churchId: string, @Body() dto: MemberStatusDto) {
    return this.members.createMemberStatus(churchId, dto);
  }

  @RequirePermissions(Permission.MEMBER_STATUSES_MANAGE)
  @Put('member-statuses/order')
  reorderMemberStatuses(@ChurchId() churchId: string, @Body() dto: ReorderDto) {
    return this.members.reorderMemberStatuses(churchId, dto.ids);
  }

  @RequirePermissions(Permission.MEMBER_STATUSES_MANAGE)
  @Patch('member-statuses/:id')
  updateMemberStatus(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: MemberStatusDto) {
    return this.members.updateMemberStatus(churchId, id, dto);
  }

  @RequirePermissions(Permission.MEMBER_STATUSES_MANAGE)
  @Delete('member-statuses/:id')
  removeMemberStatus(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.members.removeMemberStatus(churchId, id);
  }

  @Get('ministries')
  ministries(@ChurchId() churchId: string) {
    return this.members.ministries(churchId);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Post('ministries')
  createMinistry(@ChurchId() churchId: string, @Body() dto: MinistryDto) {
    return this.members.createMinistry(churchId, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Patch('ministries/:id')
  updateMinistry(@ChurchId() churchId: string, @Param('id') id: string, @Body() dto: MinistryDto) {
    return this.members.updateMinistry(churchId, id, dto);
  }

  @RequirePermissions(Permission.MEMBERS_EDIT)
  @Delete('ministries/:id')
  removeMinistry(@ChurchId() churchId: string, @Param('id') id: string) {
    return this.members.removeMinistry(churchId, id);
  }
}
